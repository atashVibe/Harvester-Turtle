(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HarvesterRobinhoodCsv = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const HEADERS = ["Activity Date", "Process Date", "Settle Date", "Instrument", "Description", "Trans Code", "Quantity", "Price", "Amount"];

  const cleanText = (value, limit = 500) => String(value == null ? "" : value).replace(/\r\n?/g, "\n").trim().slice(0, limit);
  const finite = value => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const input = String(text || "").replace(/^\uFEFF/, "");
    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      if (quoted) {
        if (char === '"' && input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (char !== "\r") {
        field += char;
      }
    }
    if (quoted) throw new Error("The CSV has an unfinished quoted value.");
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function parseMoney(value) {
    const text = cleanText(value, 80);
    if (!text) return 0;
    const negative = /^\(.*\)$/.test(text) || /^-/.test(text);
    const number = Number(text.replace(/[$,()\s]/g, "").replace(/^-/, ""));
    return Number.isFinite(number) ? (negative ? -number : number) : 0;
  }

  function parseDate(value, sequence = 0) {
    const text = cleanText(value, 40);
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return "";
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day, 12, 0, 0, Math.max(0, sequence));
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
    return date.toISOString();
  }

  function rowFingerprint(row) {
    return HEADERS.map(header => cleanText(row[header], header === "Description" ? 1000 : 200)).join("\u001f");
  }

  function hashText(text) {
    let left = 2166136261;
    let right = 2246822507;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      left = Math.imul(left ^ code, 16777619);
      right = Math.imul(right ^ code, 3266489917);
    }
    return `${(left >>> 0).toString(36)}${(right >>> 0).toString(36)}`;
  }

  function robinhoodMetadata(row) {
    return {
      activityDate: cleanText(row["Activity Date"], 40),
      processDate: cleanText(row["Process Date"], 40),
      settleDate: cleanText(row["Settle Date"], 40),
      instrument: cleanText(row.Instrument, 20).toUpperCase(),
      description: cleanText(row.Description),
      transCode: cleanText(row["Trans Code"], 20),
      quantity: cleanText(row.Quantity, 80),
      price: cleanText(row.Price, 80),
      amount: cleanText(row.Amount, 80),
    };
  }

  function parseRobinhoodCsv(text) {
    const matrix = parseCsv(text);
    if (!matrix.length) throw new Error("The CSV is empty.");
    const headers = matrix[0].map(value => cleanText(value, 100));
    if (!HEADERS.every(header => headers.includes(header))) throw new Error("This is not a Robinhood activity CSV.");
    const headerIndexes = Object.fromEntries(HEADERS.map(header => [header, headers.indexOf(header)]));
    const entries = [];
    const stockNotes = [];
    const unsupportedCodes = {};
    const occurrences = new Map();
    let blankRows = 0;
    let invalidRows = 0;

    matrix.slice(1).forEach((values, rowIndex) => {
      const row = Object.fromEntries(HEADERS.map(header => [header, values[headerIndexes[header]] || ""]));
      if (HEADERS.every(header => !cleanText(row[header]))) {
        blankRows += 1;
        return;
      }
      const code = cleanText(row["Trans Code"], 20);
      const normalizedCode = code.toLowerCase();
      if (!["buy", "sell", "ach", "lb", "ls", "bto", "stc", "oexp", "note"].includes(normalizedCode)) {
        unsupportedCodes[code || "Blank code"] = (unsupportedCodes[code || "Blank code"] || 0) + 1;
        return;
      }
      const sequence = matrix.length - rowIndex;
      const tradedAt = parseDate(row["Activity Date"], sequence);
      const fingerprint = rowFingerprint(row);
      const externalId = `robinhood:${hashText(fingerprint)}`;
      const occurrence = (occurrences.get(externalId) || 0) + 1;
      occurrences.set(externalId, occurrence);
      const metadata = robinhoodMetadata(row);

      if (normalizedCode === "note") {
        const symbol = cleanText(row.Instrument, 20).toUpperCase();
        const note = cleanText(row.Description, 1000);
        if (!/^[A-Z0-9.-]{1,15}$/.test(symbol) || !note) {
          invalidRows += 1;
          return;
        }
        stockNotes.push({symbol, note});
        return;
      }

      if (normalizedCode === "ach") {
        const amount = parseMoney(row.Amount);
        if (!tradedAt || amount <= 0) {
          invalidRows += 1;
          return;
        }
        entries.push({
          id: `${externalId}:${occurrence}`,
          externalId,
          type: "deposit",
          symbol: "",
          shares: 0,
          pricePerShare: 0,
          amount,
          orderKind: "cash",
          status: "executed",
          source: "robinhood",
          note: metadata.description || "ACH Deposit",
          tradedAt,
          createdAt: tradedAt,
          robinhood: metadata,
        });
        return;
      }

      if (["bto", "stc", "oexp"].includes(normalizedCode)) {
        const symbol = cleanText(row.Instrument, 20).toUpperCase();
        const shares = Math.abs(parseFloat(cleanText(row.Quantity, 80).replace(/,/g, ""))) || 0;
        const pricePerShare = Math.abs(parseMoney(row.Price));
        const amount = Math.abs(parseMoney(row.Amount));
        const optionContract = metadata.description.replace(/^Option Expiration for\s+/i, "").trim();
        const expiration = normalizedCode === "oexp";
        if (!tradedAt || !/^[A-Z0-9.-]{1,15}$/.test(symbol) || shares <= 0 || !optionContract || (!expiration && (pricePerShare <= 0 || amount <= 0))) {
          invalidRows += 1;
          return;
        }
        entries.push({
          id: `${externalId}:${occurrence}`,
          externalId,
          type: normalizedCode === "bto" ? "option_buy" : normalizedCode === "stc" ? "option_sell" : "option_expire",
          symbol,
          shares,
          pricePerShare: expiration ? 0 : pricePerShare,
          amount: expiration ? 0 : amount,
          optionContract,
          orderKind: "option",
          status: "executed",
          source: "robinhood",
          note: metadata.description,
          tradedAt,
          createdAt: tradedAt,
          robinhood: metadata,
        });
        return;
      }

      const pending = normalizedCode === "lb" || normalizedCode === "ls";
      const type = normalizedCode === "lb" ? "buy" : normalizedCode === "ls" ? "sell" : normalizedCode;
      const symbol = cleanText(row.Instrument, 20).toUpperCase();
      const shares = finite(cleanText(row.Quantity, 80).replace(/,/g, ""));
      const pricePerShare = Math.abs(parseMoney(row.Price));
      const amount = Math.abs(parseMoney(row.Amount)) || shares * pricePerShare;
      if (!tradedAt || !/^[A-Z0-9.-]{1,15}$/.test(symbol) || shares <= 0 || pricePerShare <= 0 || amount <= 0) {
        invalidRows += 1;
        return;
      }
      entries.push({
        id: `${externalId}:${occurrence}`,
        externalId,
        type,
        symbol,
        shares,
        pricePerShare,
        amount,
        orderKind: pending ? "limit" : "market",
        status: pending ? "pending" : "executed",
        source: pending ? "log" : "robinhood",
        note: metadata.description,
        tradedAt,
        createdAt: tradedAt,
        robinhood: metadata,
      });
    });

    return {
      entries,
      stockNotes,
      unsupportedCodes,
      unsupportedRows: Object.values(unsupportedCodes).reduce((sum, count) => sum + count, 0),
      invalidRows,
      blankRows,
      totalRows: Math.max(0, matrix.length - 1),
    };
  }

  function mergeRobinhoodEntries(existing, incoming) {
    const available = new Map();
    const pendingAvailable = new Map();
    const pendingFingerprint = entry => {
      const date = new Date(entry && entry.tradedAt);
      const dateKey = Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
      return [entry && entry.type, entry && entry.symbol, finite(entry && entry.shares).toFixed(8), finite(entry && entry.pricePerShare).toFixed(8), dateKey].join("\u001f");
    };
    (Array.isArray(existing) ? existing : []).forEach(entry => {
      if (entry && entry.status === "pending") {
        const key = pendingFingerprint(entry);
        pendingAvailable.set(key, (pendingAvailable.get(key) || 0) + 1);
        return;
      }
      if (!entry || !entry.externalId) return;
      available.set(entry.externalId, (available.get(entry.externalId) || 0) + 1);
    });
    const additions = [];
    let duplicateCount = 0;
    (Array.isArray(incoming) ? incoming : []).forEach(entry => {
      if (entry && entry.status === "pending") {
        const key = pendingFingerprint(entry);
        const remaining = pendingAvailable.get(key) || 0;
        if (remaining > 0) {
          duplicateCount += 1;
          pendingAvailable.set(key, remaining - 1);
        } else {
          additions.push(entry);
        }
        return;
      }
      const remaining = available.get(entry.externalId) || 0;
      if (remaining > 0) {
        duplicateCount += 1;
        available.set(entry.externalId, remaining - 1);
      } else {
        additions.push(entry);
      }
    });
    return {additions, duplicateCount};
  }

  const csvField = value => `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
  const formatMoney = value => `$${Math.abs(finite(value)).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  const formatQuantity = value => Math.max(0, finite(value)).toFixed(8).replace(/\.?0+$/, "");
  const formatDate = value => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  };

  function generatedRow(entry) {
    const date = formatDate(entry.tradedAt);
    if (entry.type === "deposit") {
      return {
        "Activity Date": date, "Process Date": date, "Settle Date": date, Instrument: "",
        Description: cleanText(entry.note) || "ACH Deposit", "Trans Code": "ACH", Quantity: "", Price: "", Amount: formatMoney(entry.amount),
      };
    }
    if (["option_buy", "option_sell", "option_expire"].includes(entry.type)) {
      const expiration = entry.type === "option_expire";
      const amount = formatMoney(entry.amount);
      return {
        "Activity Date": date, "Process Date": date, "Settle Date": date, Instrument: cleanText(entry.symbol, 20).toUpperCase(),
        Description: expiration ? `Option Expiration for ${cleanText(entry.optionContract, 300)}` : cleanText(entry.optionContract, 300),
        "Trans Code": entry.type === "option_buy" ? "BTO" : entry.type === "option_sell" ? "STC" : "OEXP",
        Quantity: expiration ? `${formatQuantity(entry.shares)}S` : formatQuantity(entry.shares),
        Price: expiration ? "" : formatMoney(entry.pricePerShare),
        Amount: expiration ? "" : entry.type === "option_buy" ? `(${amount})` : amount,
      };
    }
    const pending = entry.status === "pending";
    const amount = formatMoney(entry.amount || finite(entry.shares) * finite(entry.pricePerShare));
    return {
      "Activity Date": date, "Process Date": date, "Settle Date": date, Instrument: cleanText(entry.symbol, 20).toUpperCase(),
      Description: cleanText(entry.note) || (pending ? `Pending Limit ${entry.type === "sell" ? "Sell" : "Buy"}` : `${cleanText(entry.symbol, 20).toUpperCase()} Harvester Turtle log`),
      "Trans Code": pending ? (entry.type === "sell" ? "LS" : "LB") : entry.type === "sell" ? "Sell" : "Buy",
      Quantity: formatQuantity(entry.shares), Price: formatMoney(entry.pricePerShare), Amount: entry.type === "buy" ? `(${amount})` : amount,
    };
  }

  function metadataRow(entry) {
    const source = entry && entry.robinhood;
    if (!source || typeof source !== "object") return null;
    return {
      "Activity Date": cleanText(source.activityDate, 40),
      "Process Date": cleanText(source.processDate, 40),
      "Settle Date": cleanText(source.settleDate, 40),
      Instrument: cleanText(source.instrument, 20),
      Description: cleanText(source.description),
      "Trans Code": cleanText(source.transCode, 20),
      Quantity: cleanText(source.quantity, 80),
      Price: cleanText(source.price, 80),
      Amount: cleanText(source.amount, 80),
    };
  }

  function buildRobinhoodCsv(trades, stocks = []) {
    const rows = [];
    let pendingCount = 0;
    let noteCount = 0;
    let skippedOpening = 0;
    (Array.isArray(trades) ? trades : []).forEach(entry => {
      if (!entry || entry.source === "opening") {
        skippedOpening += 1;
        return;
      }
      if (!["buy", "sell", "deposit", "option_buy", "option_sell", "option_expire"].includes(entry.type)) return;
      if (entry.status === "pending") pendingCount += 1;
      rows.push(metadataRow(entry) || generatedRow(entry));
    });
    (Array.isArray(stocks) ? stocks : []).forEach(stock => {
      const symbol = cleanText(stock && stock.symbol, 20).toUpperCase();
      const note = cleanText(stock && stock.note, 1000);
      if (!/^[A-Z0-9.-]{1,15}$/.test(symbol) || !note) return;
      const date = formatDate(new Date());
      rows.push({
        "Activity Date": date, "Process Date": date, "Settle Date": date, Instrument: symbol,
        Description: note, "Trans Code": "NOTE", Quantity: "", Price: "", Amount: "",
      });
      noteCount += 1;
    });
    rows.sort((left, right) => new Date(parseDate(right["Activity Date"])) - new Date(parseDate(left["Activity Date"])));
    const lines = [HEADERS.map(csvField).join(","), ...rows.map(row => HEADERS.map(header => csvField(row[header])).join(","))];
    return {csv: `${lines.join("\r\n")}\r\n`, rowCount: rows.length, pendingCount, noteCount, skippedOpening};
  }

  return {HEADERS, parseCsv, parseMoney, parseRobinhoodCsv, mergeRobinhoodEntries, buildRobinhoodCsv};
});
