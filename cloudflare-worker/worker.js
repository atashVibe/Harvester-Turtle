const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
    if (!env.TWELVE_DATA_API_KEY) return json({ error: "Missing TWELVE_DATA_API_KEY secret" }, 500);

    const url = new URL(request.url);
    const raw = (url.searchParams.get("symbols") || "").trim();
    const symbols = [...new Set(raw.split(",").map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9.\-]{1,15}$/.test(s)))].slice(0, 20);
    if (!symbols.length) return json({ error: "Add at least one valid symbol using ?symbols=AAPL,MSFT" }, 400);

    const quotes = {};
    const errors = {};

    await Promise.all(symbols.map(async symbol => {
      try {
        const api = new URL("https://api.twelvedata.com/quote");
        api.searchParams.set("symbol", symbol);
        api.searchParams.set("apikey", env.TWELVE_DATA_API_KEY);
        const response = await fetch(api.toString(), {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        });
        const data = await response.json();
        if (!response.ok || data.status === "error") throw new Error(data.message || `HTTP ${response.status}`);
        const price = Number(data.close);
        const previousClose = Number(data.previous_close);
        if (!Number.isFinite(price) || price <= 0) throw new Error("No valid price returned");
        quotes[symbol] = { price, previousClose: Number.isFinite(previousClose) ? previousClose : null };
      } catch (error) {
        errors[symbol] = error.message || "Quote failed";
      }
    }));

    if (!Object.keys(quotes).length) {
      return json({ error: "No quotes could be updated", errors, updatedAt: new Date().toISOString() }, 502);
    }

    return json({ quotes, errors, updatedAt: new Date().toISOString(), source: "Twelve Data" });
  },
};
