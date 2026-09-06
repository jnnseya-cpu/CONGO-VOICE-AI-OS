/** Contracts shared by the frontend and the backend. No server imports here. */
export type LanguageCode = "fr" | "ln" | "kg" | "sw" | "lua";
export type ModuleType = "health" | "agriculture" | "education" | "general";
export type Role = "citizen" | "chw" | "agri_officer" | "teacher" | "ngo" | "gov_admin" | "platform_admin";
export type Severity = "low" | "medium" | "high" | "critical";

export const LANGUAGES: Array<{ code: LanguageCode; label: string; native: string; bcp47: string }> = [
  { code: "fr", label: "Français", native: "Français", bcp47: "fr-CD" },
  { code: "ln", label: "Lingala", native: "Lingála", bcp47: "ln-CD" },
  { code: "kg", label: "Kikongo", native: "Kikongo", bcp47: "kg-CD" },
  { code: "sw", label: "Swahili", native: "Kiswahili", bcp47: "sw-CD" },
  { code: "lua", label: "Tshiluba", native: "Tshilubà", bcp47: "lua-CD" },
];

export const PROVINCES: string[] = [
  "Bas-Uélé", "Équateur", "Haut-Katanga", "Haut-Lomami", "Haut-Uélé", "Ituri", "Kasaï", "Kasaï-Central", "Kasaï-Oriental",
  "Kinshasa", "Kongo-Central", "Kwango", "Kwilu", "Lomami", "Lualaba", "Maï-Ndombe", "Maniema", "Mongala", "Nord-Kivu",
  "Nord-Ubangi", "Sankuru", "Sud-Kivu", "Sud-Ubangi", "Tanganyika", "Tshopo", "Tshuapa",
];

/** The seven-part answer contract returned to every citizen. */
export interface FinalAnswer {
  asking: string;
  understanding: string;
  risk: { level: Severity; score: number; flags: string[] };
  action: string;
  escalation: { required: boolean; to: string | null; reason: string | null };
  confidence: { score: number; low: boolean };
  summary: string;
}

export interface InteractionResult {
  interactionId: string;
  status: "completed" | "failed";
  module: ModuleType;
  language: LanguageCode;
  languageConfidence: number;
  transcript: string;
  intent: string | null;
  answer: FinalAnswer;
  answerLocalised: FinalAnswer;
  responseText: string;
  followUpQuestions: string[];
  caseId: string | null;
  audioUrl: string | null;
  audioAvailable: boolean;
  latencyMs: number;
  message?: string;
}

export interface SessionUser {
  id: string;
  name: string | null;
  role: Role;
  language: LanguageCode;
  province: string | null;
  anonymous: boolean;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
