import { useState } from "react";
import { Scale, ChevronDown, ChevronUp, ShieldCheck, FileSignature, FileText } from "lucide-react";
import { useLang } from "@/hooks/use-lang";

/**
 * Top-of-page legal/disclaimer header for the Permits page.
 *
 * Pulls the same OGPE authorization + electronic-signature language we use
 * deeper inside `permits-panel.tsx` (the authorization block + the e-sign
 * dialog). Surfacing it at the top gives clients the legal context BEFORE
 * they scroll into the per-project panels — they shouldn't have to discover
 * what they're authorizing only when they hit the "Authorize" button.
 *
 * Language sources reused:
 *  - "By authorizing, you confirm the design is final and authorize KONTi
 *     to submit the OGPE permit packet on your behalf…" (permits-panel:201)
 *  - "By typing your full legal name below, you electronically sign this
 *     form and agree it has the same legal effect as a handwritten
 *     signature." (permits-panel:380)
 *  - The four-bullet packet contents list (permits-panel:208–211)
 */
export function PermitsLegalHeader() {
  const { t } = useLang();
  const [showFullText, setShowFullText] = useState(false);

  return (
    <section
      data-testid="permits-legal-header"
      aria-labelledby="permits-legal-header-title"
      className="bg-konti-olive/5 border border-konti-olive/30 rounded-xl p-5 sm:p-6 shadow-sm"
    >
      <header className="flex items-start gap-3">
        <Scale className="w-6 h-6 text-konti-olive flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h2
            id="permits-legal-header-title"
            className="text-lg sm:text-xl font-semibold text-konti-olive"
          >
            {t(
              "Legal authorization & electronic signatures",
              "Autorización legal y firmas electrónicas",
            )}
          </h2>
          <p className="text-sm text-konti-olive mt-1">
            {t(
              "Read this before authorizing KONTi to file your project with OGPE.",
              "Lee esto antes de autorizar a KONTi a someter tu proyecto a OGPE.",
            )}
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 mt-4">
        <div className="bg-white/70 rounded-lg border border-konti-olive/30 p-4">
          <h3 className="text-sm font-semibold text-konti-olive flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            {t("What this means", "Qué significa")}
          </h3>
          <p className="text-sm text-slate-700 mt-2">
            {t(
              "When you authorize the OGPE submission, you confirm the design is final and ask KONTi to file the full permit packet on your behalf with the Puerto Rico Office of Permit Management (OGPE) and any partner agencies.",
              "Al autorizar el sometimiento OGPE, confirmas que el diseño es final y le pides a KONTi que radique el paquete completo de permisos en tu nombre ante la Oficina de Gerencia de Permisos (OGPE) y las agencias colaboradoras.",
            )}
          </p>
        </div>

        <div className="bg-white/70 rounded-lg border border-konti-olive/30 p-4">
          <h3 className="text-sm font-semibold text-konti-olive flex items-center gap-2">
            <FileSignature className="w-4 h-4" aria-hidden="true" />
            {t("Your rights", "Tus derechos")}
          </h3>
          <ul className="text-sm text-slate-700 mt-2 list-disc ml-4 space-y-1">
            <li>
              {t(
                "You can withdraw or change your authorization before submission by contacting your KONTi project lead.",
                "Puedes retirar o modificar tu autorización antes del sometimiento contactando a tu líder de proyecto KONTi.",
              )}
            </li>
            <li>
              {t(
                "You will receive a copy of every signed form and the OGPE submission confirmation.",
                "Recibirás copia de cada formulario firmado y la confirmación del sometimiento a OGPE.",
              )}
            </li>
            <li>
              {t(
                "Your electronic signature has the same legal effect as a handwritten one — but only what you sign yourself.",
                "Tu firma electrónica tiene el mismo efecto legal que una manuscrita — solo lo que tú firmas.",
              )}
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowFullText((v) => !v)}
          aria-expanded={showFullText}
          aria-controls="permits-legal-full-text"
          data-testid="btn-permits-legal-toggle"
          className="inline-flex items-center gap-1 text-sm font-medium text-konti-olive hover:text-konti-olive underline-offset-2 hover:underline"
        >
          {showFullText
            ? t("Hide full text", "Ocultar texto completo")
            : t("Read the full disclosure", "Leer la divulgación completa")}
          {showFullText ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        {showFullText && (
          <div
            id="permits-legal-full-text"
            data-testid="permits-legal-full-text"
            className="mt-3 bg-white rounded-lg border border-konti-olive/30 p-4 space-y-4 text-sm text-slate-700"
          >
            <div>
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-konti-olive" aria-hidden="true" />
                {t("OGPE submission packet contents", "Contenido del paquete de sometimiento OGPE")}
              </h4>
              <p className="mt-1">
                {t(
                  "By authorizing, you confirm the design is final and authorize KONTi to submit the OGPE permit packet on your behalf. The packet includes:",
                  "Al autorizar, confirmas que el diseño es final y autorizas a KONTi a someter el paquete de permisos a OGPE en tu nombre. El paquete incluye:",
                )}
              </p>
              <ul className="mt-2 list-disc ml-5 space-y-1 text-slate-700">
                <li>
                  {t(
                    "Stamped construction plans and structural drawings",
                    "Planos de construcción sellados y dibujos estructurales",
                  )}
                </li>
                <li>
                  {t(
                    "MEP drawings (electrical, plumbing, mechanical)",
                    "Dibujos MEP (eléctrico, plomería, mecánico)",
                  )}
                </li>
                <li>
                  {t(
                    "Signed Owner's Affidavit, ARPE & OGPE applications, PE stamp authorization",
                    "Affidavit del Dueño, solicitudes ARPE y OGPE, autorización de sello PE — firmados",
                  )}
                </li>
                <li>
                  {t(
                    "Site survey, zoning analysis, and project specifications",
                    "Levantamiento del sitio, análisis de zonificación y especificaciones del proyecto",
                  )}
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-konti-olive" aria-hidden="true" />
                {t("Electronic signature notice", "Aviso sobre firma electrónica")}
              </h4>
              <p className="mt-1">
                {t(
                  "By typing your full legal name below the form when you sign, you electronically sign that form and agree it has the same legal effect as a handwritten signature. KONTi records who signed, when, and the IP address of the signing device for the audit log.",
                  "Al escribir tu nombre legal completo debajo del formulario al firmar, firmas electrónicamente ese formulario y aceptas que tiene el mismo efecto legal que una firma manuscrita. KONTi registra quién firmó, cuándo, y la dirección IP del dispositivo de firma para la bitácora de auditoría.",
                )}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-slate-900">
                {t("Questions or revocation", "Preguntas o revocación")}
              </h4>
              <p className="mt-1">
                {t(
                  "If you have questions about anything in this packet, or want to revoke an authorization or signature you previously gave, contact your KONTi project lead or write to permisos@konti.com before the packet is submitted to OGPE.",
                  "Si tienes preguntas sobre algo en este paquete, o quieres revocar una autorización o firma que diste previamente, contacta a tu líder de proyecto KONTi o escribe a permisos@konti.com antes de que el paquete sea sometido a OGPE.",
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

