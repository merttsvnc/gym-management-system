/**
 * Branch name validation constants
 *
 * The regex pattern uses Unicode property escapes to support international characters:
 * - \p{L} matches any Unicode letter (Latin, Turkish, Arabic, etc.)
 * - \p{M} matches combining marks (diacritics, accents)
 * - 0-9 matches digits
 * - Space, hyphen (-), apostrophe ('), and ampersand (&) are explicitly allowed
 *
 * The 'u' flag enables Unicode mode, making \p{} patterns work correctly.
 *
 * This allows Turkish characters (Ş, Ü, İ, ı, Ö, Ç, Ğ) and other international letters
 * while rejecting special characters like: /, *, @, #, !, ., ,, _, ", :, etc.
 */
export const BRANCH_NAME_REGEX = /^[\p{L}\p{M}0-9 '\-&]+$/u;

export const BRANCH_NAME_ERROR_MESSAGE =
  "Şube adı sadece harf, rakam, boşluk, tire (-), kesme işareti (') ve & karakterlerini içerebilir";
