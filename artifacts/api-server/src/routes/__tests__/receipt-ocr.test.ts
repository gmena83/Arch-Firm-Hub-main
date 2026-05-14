import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../../app";
import { parseReceiptText } from "../../lib/receipt-ocr";
import { LABOR_RATES, PROJECT_RECEIPTS } from "../estimating";

type LoginResponse = { token: string; user: { id: string; role: string } };

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try { return await fn(baseUrl); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

async function login(baseUrl: string, email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "konti2026" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as LoginResponse;
  return body.token;
}

// ---------------------------------------------------------------------------
// Parser unit tests — heuristic vendor/date/amount extraction
// ---------------------------------------------------------------------------

test("parseReceiptText: vendor + total from a typical hardware-store receipt", () => {
  const text = `HOME DEPOT #4521
123 Main Street, San Juan, PR
Tel: (787) 555-1234

Date: 04/15/2026
Item              Qty   Price
2x4 Lumber 8ft    20    8.50
Wood Screws 2"     1   12.99
Drill Bit Set      1   24.50
                Subtotal  207.49
                Tax        14.52
                TOTAL    $221.99

Thank you for shopping`;
  const out = parseReceiptText(text);
  assert.equal(out.vendor, "HOME DEPOT #4521");
  assert.equal(out.date, "2026-04-15");
  assert.equal(out.amount, 221.99);
});

test("parseReceiptText: ISO date and grand total wording", () => {
  const text = `Ferretería Caribe
2026-03-22
Subtotal:  120.00
Grand Total $135.50
Hours worked: 6.5`;
  const out = parseReceiptText(text);
  assert.equal(out.vendor, "Ferretería Caribe");
  assert.equal(out.date, "2026-03-22");
  assert.equal(out.amount, 135.50);
  assert.equal(out.hours, 6.5);
});

test("parseReceiptText: falls back to largest dollar value when no TOTAL label", () => {
  const text = `Vendor X
Item 1   10.00
Item 2   45.50
Item 3   120.75`;
  const out = parseReceiptText(text);
  assert.equal(out.amount, 120.75);
});

// ---------------------------------------------------------------------------
// Endpoint tests with mocked PDF.co — patch global fetch for api.pdf.co only
// ---------------------------------------------------------------------------

interface PdfCoMockRecord { calls: Array<{ url: string; body: unknown }>; text: string; }

function installPdfCoMock(record: PdfCoMockRecord) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    if (url.startsWith("https://api.pdf.co/")) {
      const body = init && init.body ? JSON.parse(String(init.body)) : null;
      record.calls.push({ url, body });
      if (url.endsWith("/file/upload/base64")) {
        return new Response(JSON.stringify({ url: "https://files.pdf.co/uploaded.png", error: false }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/pdf/convert/from/image")) {
        return new Response(JSON.stringify({ url: "https://files.pdf.co/uploaded.pdf", error: false }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/pdf/convert/to/text")) {
        return new Response(JSON.stringify({ body: record.text, error: false }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: true, message: `unmocked ${url}` }), { status: 500 });
    }
    return realFetch(input as Parameters<typeof fetch>[0], init);
  }) as typeof fetch;
  return () => { globalThis.fetch = realFetch; };
}

function snapshotReceipts() {
  const recs: Record<string, unknown> = {};
  for (const k of Object.keys(PROJECT_RECEIPTS)) recs[k] = JSON.parse(JSON.stringify(PROJECT_RECEIPTS[k]));
  const rates = JSON.parse(JSON.stringify(LABOR_RATES));
  return { recs, rates };
}
function restoreReceipts(snap: ReturnType<typeof snapshotReceipts>) {
  for (const k of Object.keys(PROJECT_RECEIPTS)) delete PROJECT_RECEIPTS[k];
  for (const k of Object.keys(snap.recs)) (PROJECT_RECEIPTS as Record<string, unknown>)[k] = snap.recs[k];
  LABOR_RATES.splice(0, LABOR_RATES.length, ...snap.rates);
}

test("POST /projects/:id/receipts/upload-file extracts via OCR and refreshes labor", async () => {
  const snap = snapshotReceipts();
  const previousKey = process.env["PDF_CO_API_KEY"];
  process.env["PDF_CO_API_KEY"] = "test-key";
  const record: PdfCoMockRecord = {
    calls: [],
    text: `HOME DEPOT
04/20/2026
Lumber  100.00
TOTAL  $480.00`,
  };
  const restoreFetch = installPdfCoMock(record);
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      const res = await fetch(`${baseUrl}/api/projects/proj-1/receipts/upload-file`, {
        method: "POST", headers: auth,
        body: JSON.stringify({
          fileBase64: "ZmFrZQ==",
          filename: "receipt.png",
          trade: "Carpenter",
          hours: 12,
        }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        receipts: Array<{ vendor: string; trade: string; amount: number; hours: number }>;
        updatedTrades: string[];
        rates: Array<{ trade: string; hourlyRate: number; source: string }>;
        ocrExtracted: { vendor?: string; amount?: number };
        newReceipt: { vendor: string; amount: number; hours: number; trade: string };
      };
      // OCR returned vendor + amount, hours came from the user override
      assert.equal(body.newReceipt.vendor, "HOME DEPOT");
      assert.equal(body.newReceipt.amount, 480);
      assert.equal(body.newReceipt.hours, 12);
      assert.equal(body.newReceipt.trade, "Carpenter");
      // Labor baseline updated
      const carp = body.rates.find((r) => r.trade === "Carpenter");
      assert.ok(carp);
      assert.equal(carp?.source, "receipts");
      // 480 / 12 = 40
      assert.ok(carp && Math.abs(carp.hourlyRate - 40) < 0.01);
      // PDF.co was called: upload, image→pdf, pdf→text (3 calls)
      assert.equal(record.calls.length, 3);
    });
  } finally {
    restoreFetch();
    if (previousKey === undefined) delete process.env["PDF_CO_API_KEY"];
    else process.env["PDF_CO_API_KEY"] = previousKey;
    restoreReceipts(snap);
  }
});

test("POST /projects/:id/receipts/upload-file returns 422 when amount/hours can't be extracted", async () => {
  const snap = snapshotReceipts();
  const previousKey = process.env["PDF_CO_API_KEY"];
  process.env["PDF_CO_API_KEY"] = "test-key";
  const record: PdfCoMockRecord = { calls: [], text: "Just some text without any numbers or totals" };
  const restoreFetch = installPdfCoMock(record);
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const res = await fetch(`${baseUrl}/api/projects/proj-1/receipts/upload-file`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ fileBase64: "ZmFrZQ==", filename: "receipt.pdf", trade: "Carpenter" }),
      });
      assert.equal(res.status, 422);
      const body = (await res.json()) as { error: string; message: string };
      assert.equal(body.error, "incomplete_extraction");
      assert.match(body.message, /amount|hours/);
    });
  } finally {
    restoreFetch();
    if (previousKey === undefined) delete process.env["PDF_CO_API_KEY"];
    else process.env["PDF_CO_API_KEY"] = previousKey;
    restoreReceipts(snap);
  }
});

test("POST /projects/:id/receipts/upload-file requires trade", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "demo@konti.com");
    const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const res = await fetch(`${baseUrl}/api/projects/proj-1/receipts/upload-file`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ fileBase64: "ZmFrZQ==", filename: "receipt.pdf" }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "missing_trade");
  });
});

test("POST /projects/:id/receipts/upload-file rejects unsupported file types", async () => {
  const previousKey = process.env["PDF_CO_API_KEY"];
  process.env["PDF_CO_API_KEY"] = "test-key";
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const res = await fetch(`${baseUrl}/api/projects/proj-1/receipts/upload-file`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ fileBase64: "ZmFrZQ==", filename: "receipt.docx", trade: "Carpenter" }),
      });
      assert.equal(res.status, 502);
      const body = (await res.json()) as { error: string; message: string };
      assert.equal(body.error, "ocr_failed");
      assert.match(body.message, /Unsupported file type/);
    });
  } finally {
    if (previousKey === undefined) delete process.env["PDF_CO_API_KEY"];
    else process.env["PDF_CO_API_KEY"] = previousKey;
  }
});
