// Receipt OCR via PDF.co. Accepts a base64-encoded image or PDF, runs OCR,
// returns the extracted plain text plus a best-effort structured parse.
//
// P5.1 + P5.2 — also exposes `extractReceiptLineItems()` which calls Claude
// to break the OCR text into structured line items so a Home Depot receipt
// with 8 materials produces 8 categorized rows instead of one lump-sum
// (per Jorge's meeting question: "una factura de Home Depot puede incluir
// varios materiales").

import { logger } from "./logger";
import Anthropic from "@anthropic-ai/sdk";
import { getManagedSecret } from "./managed-secrets";

export interface OcrExtraction {
  text: string;
  vendor?: string;
  date?: string;
  amount?: number;
  hours?: number;
}

/** P5.1 — line-item shape produced by the AI extractor. */
export interface ReceiptLineItem {
  /** Free-text description as it appears on the receipt. */
  description: string;
  /** Best-guess trade category (matches lib/report-categories keys). */
  category: string;
  /** Quantity if visible on the receipt; otherwise 1. */
  quantity: number;
  /** Per-unit price in USD; or the line subtotal if qty=1. */
  unitPrice: number;
  /** Computed line total (quantity * unitPrice). */
  lineTotal: number;
  /** Free-text unit (e.g. "ea", "sqft", "ft", "gal", "bag"). */
  unit?: string;
}

export interface OcrInput {
  fileBase64: string;
  filename: string;
}

const PDF_CO_BASE = "https://api.pdf.co/v1";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "tif", "tiff", "bmp", "webp"]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

async function pdfcoFetch(path: string, apiKey: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${PDF_CO_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json["error"] === true) {
    const msg = (json["message"] as string) || `PDF.co request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

// Calls PDF.co to extract OCR text from a base64-encoded image or PDF.
export async function extractReceiptText(input: OcrInput, apiKey: string): Promise<string> {
  const ext = extOf(input.filename);
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isPdf = ext === "pdf";
  if (!isImage && !isPdf) {
    throw new Error(`Unsupported file type ".${ext}". Upload a PDF or image (PNG/JPG/etc.).`);
  }

  // 1. Upload file (base64) to PDF.co storage → get a temporary URL.
  const upload = await pdfcoFetch("/file/upload/base64", apiKey, {
    file: input.fileBase64,
    name: input.filename,
  });
  const uploadedUrl = upload["url"] as string | undefined;
  if (!uploadedUrl) throw new Error("PDF.co did not return an upload URL.");

  // 2. If image → convert to PDF first.
  let pdfUrl = uploadedUrl;
  if (isImage) {
    const conv = await pdfcoFetch("/pdf/convert/from/image", apiKey, {
      url: uploadedUrl,
      name: input.filename.replace(/\.[^.]+$/, "") + ".pdf",
      async: false,
    });
    const out = conv["url"] as string | undefined;
    if (!out) throw new Error("PDF.co did not return a PDF URL after image conversion.");
    pdfUrl = out;
  }

  // 3. Run OCR text extraction. inline:true returns the text in the response body.
  const text = await pdfcoFetch("/pdf/convert/to/text", apiKey, {
    url: pdfUrl,
    inline: true,
    async: false,
    ocrLanguage: "eng+spa",
  });
  const body = text["body"];
  if (typeof body !== "string") {
    throw new Error("PDF.co text conversion did not return a body.");
  }
  return body;
}

// Heuristic parse for vendor / date / amount / hours from receipt OCR text.
export function parseReceiptText(raw: string): Pick<OcrExtraction, "vendor" | "date" | "amount" | "hours"> {
  const text = raw.replace(/\u00a0/g, " ");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Vendor heuristic: first meaningful non-numeric line that doesn't look like
  // a header label (date/total/tel/etc.). Receipts almost always start with
  // the merchant name.
  const skip = /^(receipt|invoice|cash receipt|tel|phone|address|date|total|subtotal|customer|bill|order|ticket)\b/i;
  const vendor = lines.find((l) => l.length > 2 && !/^[\d\W]+$/.test(l) && !skip.test(l)) ?? lines[0];

  // Date heuristic: scan a few common formats.
  let date: string | undefined;
  const dateRe = /\b(\d{4}-\d{2}-\d{2})\b|\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b|\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Ene|Abr|Ago|Dic)[a-zñ]*\s+\d{1,2},?\s+\d{4})\b/i;
  for (const l of lines) {
    const m = l.match(dateRe);
    if (m) {
      date = normalizeDate(m[0]);
      if (date) break;
    }
  }

  // Amount heuristic: prefer line tagged as "TOTAL"/"GRAND TOTAL"/"AMOUNT DUE",
  // ignoring "SUBTOTAL". Fallback to the largest dollar value in the body.
  let amount: number | undefined;
  const totalRe = /(?:grand\s*total|amount\s*due|balance\s*due|total\s*due|^total\b|\btotal\s*[:\-]|\btotal\s+\$)/i;
  const subtotalRe = /sub.?total/i;
  for (const l of [...lines].reverse()) {
    if (subtotalRe.test(l)) continue;
    if (totalRe.test(l)) {
      const m = l.match(/\$?\s*([\d,]+\.\d{2})/);
      if (m && m[1]) {
        amount = parseFloat(m[1].replace(/,/g, ""));
        break;
      }
    }
  }
  if (amount === undefined) {
    const all: number[] = [];
    const re = /\$?\s*([\d,]+\.\d{2})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const v = parseFloat((m[1] ?? "").replace(/,/g, ""));
      if (isFinite(v) && v > 0) all.push(v);
    }
    if (all.length > 0) amount = Math.max(...all);
  }

  // Hours heuristic: explicit "X hours/hrs/horas". Scan line-by-line so we
  // never bridge across a newline (e.g. "$135.50\nHours: 6.5").
  let hours: number | undefined;
  const hoursAfter = /(\d+(?:\.\d+)?)[ \t]*(?:hours?|hrs?|horas?)\b/i;
  const hoursBefore = /\b(?:hours?|hrs?|horas?)\b[^\d\n]{0,30}(\d+(?:\.\d+)?)/i;
  for (const l of lines) {
    const m = l.match(hoursAfter) ?? l.match(hoursBefore);
    if (m && m[1]) {
      const v = parseFloat(m[1]);
      if (isFinite(v) && v > 0) { hours = v; break; }
    }
  }

  return { vendor, date, amount, hours };
}

function normalizeDate(input: string): string | undefined {
  const s = input.trim();
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or DD-MM-YYYY etc.
  const dm = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dm) {
    const a = parseInt(dm[1] ?? "0", 10);
    const b = parseInt(dm[2] ?? "0", 10);
    let y = parseInt(dm[3] ?? "0", 10);
    if (y < 100) y += 2000;
    // Assume MM/DD/YYYY (US receipts most common). Swap if month > 12.
    let mo = a;
    let d = b;
    if (a > 12 && b <= 12) { mo = b; d = a; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
    return `${y.toString().padStart(4, "0")}-${mo.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  }
  // Month-name forms — let Date parse it.
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return undefined;
}

export async function extractAndParseReceipt(input: OcrInput, apiKey: string): Promise<OcrExtraction> {
  const text = await extractReceiptText(input, apiKey);
  const parsed = parseReceiptText(text);
  logger.info({ vendor: parsed.vendor, date: parsed.date, amount: parsed.amount, hours: parsed.hours }, "receipt OCR parsed");
  return { text, ...parsed };
}

// P5.1 — categories the AI may assign. Mirrors `lib/report-categories`
// trade-level keys so the variance rollup routes the line into the right
// bucket without extra mapping. Keep this list short enough for the model
// to stay deterministic — broader category coverage is fine to add later.
const ALLOWED_CATEGORIES = [
  "container_purchase",
  "structural_prep",
  "cuts_and_frames",
  "interior_build",
  "exterior_windows_and_doors",
  "plumbing",
  "electrical",
  "painting",
  "consumables",
  "bathroom",
  "kitchen",
  "finishes",
  "decking",
  "appliances",
  "labor",
  "subcontractor",
  "foundation",
  "site_electric",
  "site_plumbing",
  "site_work",
  "other",
] as const;

const LINE_EXTRACTION_SYSTEM = `You are KONTi's receipt parser. Given the raw OCR text of a construction-site receipt, extract a structured list of line items.

Output rules (strict):
- Return ONLY a single JSON object: {"items":[...]}
- Each item: {"description":"...","category":"...","quantity":<number>,"unitPrice":<number>,"unit":"..."}
- "category" MUST be one of: ${ALLOWED_CATEGORIES.join(", ")}
- If a line is ambiguous, set "category":"other".
- Skip header rows, taxes, subtotals, totals, and footer lines. ONLY actual purchased items.
- quantity defaults to 1 when not visible. unitPrice is per-unit; if only a line total is shown, set quantity=1 and unitPrice=lineTotal.
- "unit" is free-text ("ea","sqft","ft","gal","lb","bag","each","unidad"). Use "ea" when unknown.
- If there are NO purchasable items, return {"items":[]}.
- Never include commentary, explanations, or markdown fences. Just the JSON object.`;

/**
 * P5.1 — Run Claude on the OCR text to extract structured line items.
 * Returns an empty list (never throws) on any AI failure so the route
 * can still respond with the raw OCR text + the legacy single-line parse.
 */
export async function extractReceiptLineItems(ocrText: string): Promise<ReceiptLineItem[]> {
  const apiKey = getManagedSecret("ANTHROPIC_API_KEY");
  if (!apiKey) {
    logger.warn("Line-item extraction skipped: ANTHROPIC_API_KEY not configured.");
    return [];
  }
  // Trim absurdly long OCR text so we don't blow the context window on a
  // pathologically long receipt scan (the model only needs the line table).
  const truncated = ocrText.length > 12_000 ? ocrText.slice(0, 12_000) : ocrText;
  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: LINE_EXTRACTION_SYSTEM,
      messages: [
        { role: "user", content: `OCR TEXT:\n\n${truncated}\n\nExtract the line items now.` },
      ],
    });
    // The SDK returns content blocks; we want the first text block.
    const block = resp.content.find((c) => c.type === "text");
    if (!block || block.type !== "text") return [];
    const raw = block.text.trim();
    // Strip an accidental ```json fence if the model emits one.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as { items?: unknown };
    if (!parsed || !Array.isArray(parsed.items)) return [];
    const allowed = new Set(ALLOWED_CATEGORIES as readonly string[]);
    const out: ReceiptLineItem[] = [];
    for (const r of parsed.items) {
      if (!r || typeof r !== "object") continue;
      const row = r as Record<string, unknown>;
      const description = String(row["description"] ?? "").trim().slice(0, 300);
      if (!description) continue;
      const rawCategory = String(row["category"] ?? "other").trim().toLowerCase();
      const category = allowed.has(rawCategory) ? rawCategory : "other";
      const qty = Number(row["quantity"] ?? 1);
      const unitPrice = Number(row["unitPrice"] ?? 0);
      const unit = String(row["unit"] ?? "ea").trim().slice(0, 20) || "ea";
      if (!isFinite(qty) || qty <= 0) continue;
      if (!isFinite(unitPrice) || unitPrice < 0) continue;
      out.push({
        description,
        category,
        quantity: Math.round(qty * 100) / 100,
        unitPrice: Math.round(unitPrice * 100) / 100,
        lineTotal: Math.round(qty * unitPrice * 100) / 100,
        unit,
      });
    }
    logger.info({ extracted: out.length, ocrChars: ocrText.length }, "receipt line-items extracted");
    return out;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "line-item extraction failed; returning empty list");
    return [];
  }
}
