// Bilingual transactional email templates. Each template returns a fully
// rendered { subject, text, html } payload for the requested language.

export type Lang = "en" | "es";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface SignatureRequestVars {
  projectName: string;
  formName: string;
  formNameEs: string;
  recipientName: string;
  signUrl: string;
  requestedBy: string;
}

export interface SignatureCompletedVars {
  projectName: string;
  formName: string;
  formNameEs: string;
  signedBy: string;
  signedAt: string;
  remainingCount: number;
}

export interface PhaseKickoffVars {
  projectName: string;
  recipientName: string;
  nextPhaseEn: string;
  nextPhaseEs: string;
  projectUrl: string;
}

export interface DeclineNotifyVars {
  projectName: string;
  clientName: string;
  reason: string;
  projectUrl: string;
}

export interface ProposalAcceptVars {
  projectName: string;
  proposalTitle: string;
  proposalTitleEs: string;
  totalCost: number;
  recipientName: string;
}

const wrap = (title: string, body: string): string =>
  `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#111;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">` +
  `<h1 style="font-size:20px;margin:0 0 16px;color:#065f46">${title}</h1>${body}` +
  `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>` +
  `<p style="font-size:12px;color:#6b7280">KONTi Design | Build Studio</p></body></html>`;

export function renderSignatureRequest(lang: Lang, v: SignatureRequestVars): RenderedEmail {
  const formName = lang === "es" ? v.formNameEs : v.formName;
  if (lang === "es") {
    const subject = `Firma requerida: ${formName} (${v.projectName})`;
    const text = `Hola ${v.recipientName},\n\n${v.requestedBy} solicita tu firma del documento "${formName}" para el proyecto ${v.projectName}.\n\nFirma aquí: ${v.signUrl}\n\nGracias,\nEquipo KONTi`;
    const html = wrap(
      "Firma requerida",
      `<p>Hola ${v.recipientName},</p><p><strong>${v.requestedBy}</strong> solicita tu firma del documento <strong>${formName}</strong> para el proyecto <strong>${v.projectName}</strong>.</p><p><a href="${v.signUrl}" style="display:inline-block;background:#059669;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Firmar ahora</a></p>`,
    );
    return { subject, text, html };
  }
  const subject = `Signature requested: ${formName} (${v.projectName})`;
  const text = `Hi ${v.recipientName},\n\n${v.requestedBy} is requesting your signature on "${formName}" for project ${v.projectName}.\n\nSign here: ${v.signUrl}\n\nThanks,\nKONTi Team`;
  const html = wrap(
    "Signature requested",
    `<p>Hi ${v.recipientName},</p><p><strong>${v.requestedBy}</strong> is requesting your signature on <strong>${formName}</strong> for project <strong>${v.projectName}</strong>.</p><p><a href="${v.signUrl}" style="display:inline-block;background:#059669;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Sign now</a></p>`,
  );
  return { subject, text, html };
}

export function renderSignatureCompleted(lang: Lang, v: SignatureCompletedVars): RenderedEmail {
  const formName = lang === "es" ? v.formNameEs : v.formName;
  if (lang === "es") {
    const subject = `Firma recibida: ${formName} (${v.projectName})`;
    const text = `${v.signedBy} firmó "${formName}" el ${v.signedAt}.\nFirmas pendientes: ${v.remainingCount}.`;
    return { subject, text, html: wrap("Firma recibida", `<p><strong>${v.signedBy}</strong> firmó <strong>${formName}</strong> el ${v.signedAt}.</p><p>Firmas pendientes: <strong>${v.remainingCount}</strong></p>`) };
  }
  const subject = `Signature received: ${formName} (${v.projectName})`;
  const text = `${v.signedBy} signed "${formName}" on ${v.signedAt}.\nRemaining signatures: ${v.remainingCount}.`;
  return { subject, text, html: wrap("Signature received", `<p><strong>${v.signedBy}</strong> signed <strong>${formName}</strong> on ${v.signedAt}.</p><p>Remaining signatures: <strong>${v.remainingCount}</strong></p>`) };
}

export function renderPhaseKickoff(lang: Lang, v: PhaseKickoffVars): RenderedEmail {
  if (lang === "es") {
    const subject = `Inicio de fase: ${v.nextPhaseEs} — ${v.projectName}`;
    const text = `Hola ${v.recipientName},\nTu proyecto ${v.projectName} avanzó a ${v.nextPhaseEs}.\nVer: ${v.projectUrl}`;
    return { subject, text, html: wrap("Inicio de Pre-Diseño", `<p>Hola ${v.recipientName},</p><p>Tu proyecto <strong>${v.projectName}</strong> avanzó a <strong>${v.nextPhaseEs}</strong>.</p><p><a href="${v.projectUrl}">Ver proyecto</a></p>`) };
  }
  const subject = `Phase kickoff: ${v.nextPhaseEn} — ${v.projectName}`;
  const text = `Hi ${v.recipientName},\nYour project ${v.projectName} advanced to ${v.nextPhaseEn}.\nView: ${v.projectUrl}`;
  return { subject, text, html: wrap("Pre-Design kickoff", `<p>Hi ${v.recipientName},</p><p>Your project <strong>${v.projectName}</strong> advanced to <strong>${v.nextPhaseEn}</strong>.</p><p><a href="${v.projectUrl}">View project</a></p>`) };
}

export function renderDeclineNotify(lang: Lang, v: DeclineNotifyVars): RenderedEmail {
  if (lang === "es") {
    const subject = `Cliente declinó avance: ${v.projectName}`;
    const text = `${v.clientName} declinó avanzar a Pre-Diseño en ${v.projectName}.\nMotivo: ${v.reason || "(no proporcionado)"}\nProyecto: ${v.projectUrl}`;
    return { subject, text, html: wrap("Cliente declinó", `<p><strong>${v.clientName}</strong> declinó avanzar a Pre-Diseño en <strong>${v.projectName}</strong>.</p><p><em>Motivo:</em> ${v.reason || "(no proporcionado)"}</p><p><a href="${v.projectUrl}">Ver proyecto</a></p>`) };
  }
  const subject = `Client declined to advance: ${v.projectName}`;
  const text = `${v.clientName} declined to advance to Pre-Design on ${v.projectName}.\nReason: ${v.reason || "(none provided)"}\nProject: ${v.projectUrl}`;
  return { subject, text, html: wrap("Client declined", `<p><strong>${v.clientName}</strong> declined to advance to Pre-Design on <strong>${v.projectName}</strong>.</p><p><em>Reason:</em> ${v.reason || "(none provided)"}</p><p><a href="${v.projectUrl}">View project</a></p>`) };
}

export function renderProposalAccept(lang: Lang, v: ProposalAcceptVars): RenderedEmail {
  const title = lang === "es" ? v.proposalTitleEs : v.proposalTitle;
  const cost = `$${v.totalCost.toLocaleString()}`;
  if (lang === "es") {
    const subject = `Recibo de aceptación: ${title} — ${v.projectName}`;
    const text = `Hola ${v.recipientName},\nGracias por aceptar la propuesta "${title}" (${cost}) para el proyecto ${v.projectName}.\nEl borrador del contrato está en preparación.`;
    return { subject, text, html: wrap("Aceptación de propuesta", `<p>Hola ${v.recipientName},</p><p>Gracias por aceptar la propuesta <strong>${title}</strong> (${cost}) para el proyecto <strong>${v.projectName}</strong>.</p><p>El borrador del contrato está en preparación y será enviado en breve.</p>`) };
  }
  const subject = `Proposal acceptance receipt: ${title} — ${v.projectName}`;
  const text = `Hi ${v.recipientName},\nThanks for accepting "${title}" (${cost}) for ${v.projectName}.\nA contract draft is being prepared.`;
  return { subject, text, html: wrap("Proposal accepted", `<p>Hi ${v.recipientName},</p><p>Thanks for accepting <strong>${title}</strong> (${cost}) for project <strong>${v.projectName}</strong>.</p><p>A contract draft is being prepared and will follow shortly.</p>`) };
}

export type TemplateName =
  | "signature_request"
  | "signature_completed"
  | "phase_kickoff"
  | "decline_notify"
  | "proposal_accept";
