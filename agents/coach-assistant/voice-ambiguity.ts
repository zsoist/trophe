const alternatives = new Set(['or', 'o', 'ou', 'oder', 'of', 'ή', 'η', 'versus', 'vs']);
const numberWords = new Set([
  'zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','hundred',
  'cero','uno','una','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciseis','dieciséis','veinte','treinta','cuarenta','cincuenta','cien',
  'un','une','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','quinze','cinquante',
  'null','eins','ein','zwei','drei','vier','fünf','sechs','sieben','acht','neun','zehn','fünfzehn','fünfzig',
  'uno','una','due','tre','quattro','cinque','sei','sette','otto','nove','dieci','quindici','cinquanta',
  'um','uma','dois','duas','três','quatro','cinco','seis','sete','oito','nove','dez','quinze','cinquenta',
  'nul','een','twee','drie','vier','vijf','zes','zeven','acht','negen','tien','vijftien','vijftig',
  'μηδέν','ενα','ένα','δυο','δύο','τρία','τέσσερα','πέντε','έξι','επτά','οκτώ','εννέα','δέκα',
]);
const numeric = (token: string) => /^\d+(?:[.,]\d+)?$/.test(token) || numberWords.has(token);

/** Browser-safe preflight mirrored by the reviewed server turn. */
export function hasAmbiguousSpokenNumber(text: string): boolean {
  const tokens = text.toLocaleLowerCase().normalize('NFKC').match(/[\p{L}]+|\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?/gu) ?? [];
  for (let index = 1; index < tokens.length - 1; index++) {
    if (alternatives.has(tokens[index]) && numeric(tokens[index - 1]) && numeric(tokens[index + 1])) return true;
  }
  return tokens.some(token => /^\d+(?:[.,]\d+)?\/\d+(?:[.,]\d+)?$/.test(token));
}
