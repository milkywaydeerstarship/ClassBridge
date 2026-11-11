export interface Language {
  code: string; // translation code (MyMemory / Google)
  bcp47: string; // speech recognition / synthesis locale
  label: string;
  short: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", label: "English", short: "EN", bcp47: "en-US" },
  { code: "es", label: "Spanish", short: "ES", bcp47: "es-ES" },
  { code: "fr", label: "French", short: "FR", bcp47: "fr-FR" },
  { code: "de", label: "German", short: "DE", bcp47: "de-DE" },
  { code: "it", label: "Italian", short: "IT", bcp47: "it-IT" },
  { code: "pt", label: "Portuguese", short: "PT", bcp47: "pt-PT" },
  { code: "nl", label: "Dutch", short: "NL", bcp47: "nl-NL" },
  { code: "ru", label: "Russian", short: "RU", bcp47: "ru-RU" },
  { code: "uk", label: "Ukrainian", short: "UK", bcp47: "uk-UA" },
  { code: "pl", label: "Polish", short: "PL", bcp47: "pl-PL" },
  { code: "tr", label: "Turkish", short: "TR", bcp47: "tr-TR" },
  { code: "el", label: "Greek", short: "EL", bcp47: "el-GR" },
  { code: "sv", label: "Swedish", short: "SV", bcp47: "sv-SE" },
  { code: "zh-CN", label: "Chinese (Simplified)", short: "ZH", bcp47: "zh-CN" },
  { code: "ja", label: "Japanese", short: "JA", bcp47: "ja-JP" },
  { code: "ko", label: "Korean", short: "KO", bcp47: "ko-KR" },
  { code: "ar", label: "Arabic", short: "AR", bcp47: "ar-SA" },
  { code: "hi", label: "Hindi", short: "HI", bcp47: "hi-IN" },
  { code: "bn", label: "Bengali", short: "BN", bcp47: "bn-IN" },
  { code: "ur", label: "Urdu", short: "UR", bcp47: "ur-PK" },
  { code: "fa", label: "Persian", short: "FA", bcp47: "fa-IR" },
  { code: "he", label: "Hebrew", short: "HE", bcp47: "he-IL" },
  { code: "th", label: "Thai", short: "TH", bcp47: "th-TH" },
  { code: "vi", label: "Vietnamese", short: "VI", bcp47: "vi-VN" },
  { code: "id", label: "Indonesian", short: "ID", bcp47: "id-ID" },
  { code: "ro", label: "Romanian", short: "RO", bcp47: "ro-RO" },
  { code: "cs", label: "Czech", short: "CS", bcp47: "cs-CZ" },
  { code: "hu", label: "Hungarian", short: "HU", bcp47: "hu-HU" },
  { code: "sw", label: "Swahili", short: "SW", bcp47: "sw-KE" },
  { code: "ta", label: "Tamil", short: "TA", bcp47: "ta-IN" },
];

export const langByCode = (code: string): Language =>
  LANGUAGES.find((l) => l.code.toLowerCase() === code.toLowerCase()) ??
  LANGUAGES.find((l) => l.code.split("-")[0] === code.split("-")[0]) ??
  LANGUAGES[0];

export const langLabel = (code: string): string => langByCode(code).label;
