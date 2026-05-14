// Failure-isolated mailer facade.
// All callers go through `sendTransactional` which:
//   1. Routes to the requested template renderer
//   2. Acquires a fresh Resend client (per-call, no caching)
//   3. Sends the email and surfaces a structured {ok,reason?} result
//   4. NEVER throws — failures are reported, not raised — so a
//      mailer outage cannot block the originating mutation.
//
// In test mode (NODE_ENV=test) or when the connector isn't configured,
// `sendTransactional` resolves with {ok:false, reason:"no_credentials"}.
// A test override hook (`__setTestMailerHook`) lets unit tests assert on
// payloads without hitting Resend.

import { getUncachableResendClient } from "./client";
import {
  renderDeclineNotify,
  renderPhaseKickoff,
  renderProposalAccept,
  renderSignatureCompleted,
  renderSignatureRequest,
  type DeclineNotifyVars,
  type Lang,
  type PhaseKickoffVars,
  type ProposalAcceptVars,
  type RenderedEmail,
  type SignatureCompletedVars,
  type SignatureRequestVars,
  type TemplateName,
} from "./templates";
import { logger } from "../logger";

export type SendArgs =
  | { template: "signature_request"; lang: Lang; to: string | string[]; cc?: string[]; vars: SignatureRequestVars }
  | { template: "signature_completed"; lang: Lang; to: string | string[]; cc?: string[]; vars: SignatureCompletedVars }
  | { template: "phase_kickoff"; lang: Lang; to: string | string[]; cc?: string[]; vars: PhaseKickoffVars }
  | { template: "decline_notify"; lang: Lang; to: string | string[]; cc?: string[]; vars: DeclineNotifyVars }
  | { template: "proposal_accept"; lang: Lang; to: string | string[]; cc?: string[]; vars: ProposalAcceptVars };

export interface SendResult {
  ok: boolean;
  id?: string;
  reason?: string;
  template: TemplateName;
}

function render(args: SendArgs): RenderedEmail {
  switch (args.template) {
    case "signature_request": return renderSignatureRequest(args.lang, args.vars);
    case "signature_completed": return renderSignatureCompleted(args.lang, args.vars);
    case "phase_kickoff": return renderPhaseKickoff(args.lang, args.vars);
    case "decline_notify": return renderDeclineNotify(args.lang, args.vars);
    case "proposal_accept": return renderProposalAccept(args.lang, args.vars);
  }
}

// Test override hook — when set, sendTransactional invokes this instead
// of the real Resend client. Mirrors the asanaSyncHook pattern.
export type TestMailerHook = (args: SendArgs, rendered: RenderedEmail) => SendResult | Promise<SendResult>;
let testHook: TestMailerHook | null = null;
export function __setTestMailerHook(hook: TestMailerHook | null): void {
  testHook = hook;
}

export async function sendTransactional(args: SendArgs): Promise<SendResult> {
  const rendered = render(args);
  if (testHook) {
    try { return await testHook(args, rendered); }
    catch (err) {
      logger.warn({ err, template: args.template }, "mailer test hook threw");
      return { ok: false, reason: "test_hook_threw", template: args.template };
    }
  }
  if (process.env["NODE_ENV"] === "test") {
    return { ok: false, reason: "test_env", template: args.template };
  }
  let mailer;
  try {
    mailer = await getUncachableResendClient();
  } catch (err) {
    logger.warn({ err, template: args.template }, "mailer credential lookup failed");
    return { ok: false, reason: "credentials_error", template: args.template };
  }
  if (!mailer) return { ok: false, reason: "no_credentials", template: args.template };
  try {
    const result = await mailer.client.emails.send({
      from: mailer.fromEmail,
      to: Array.isArray(args.to) ? args.to : [args.to],
      ...(args.cc && args.cc.length > 0 ? { cc: args.cc } : {}),
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    if (result.error) {
      logger.warn({ err: result.error, template: args.template }, "resend rejected email");
      return { ok: false, reason: result.error.message ?? "resend_error", template: args.template };
    }
    return { ok: true, id: result.data?.id, template: args.template };
  } catch (err) {
    logger.warn({ err, template: args.template }, "resend send threw");
    return { ok: false, reason: err instanceof Error ? err.message : "send_threw", template: args.template };
  }
}

export type { Lang, TemplateName } from "./templates";
