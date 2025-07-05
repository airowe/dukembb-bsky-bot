// Utility to decode HTML entities in tweet text
export function htmlDecode(text: string): string {
  if (!text) return '';
  return text.replace(/&([a-zA-Z]+);|&#(\d+);|&#x([\da-fA-F]+);/g, (match, named, dec, hex) => {
    if (named) {
      // Named HTML entities
      const entities: Record<string, string> = {
        amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', copy: '©', reg: '®', euro: '€', trade: '™', laquo: '«', raquo: '»', middot: '·', bull: '•', para: '¶', sect: '§', deg: '°', plusmn: '±', sup2: '²', sup3: '³', frac14: '¼', frac12: '½', frac34: '¾', times: '×', divide: '÷', oelig: 'œ', aelig: 'æ', szlig: 'ß', uuml: 'ü', ouml: 'ö', auml: 'ä', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', iacute: 'í', icirc: 'î', ograve: 'ò', oacute: 'ó', ocirc: 'ô', uacute: 'ú', ucirc: 'û', ugrave: 'ù', yacute: 'ý', yuml: 'ÿ', ccedil: 'ç', ntilde: 'ñ', aacute: 'á', atilde: 'ã', acirc: 'â', agrave: 'à', aring: 'å', eth: 'ð', thorn: 'þ', THORN: 'Þ', ETH: 'Ð', Yuml: 'Ÿ', Iuml: 'Ï', Ouml: 'Ö', Auml: 'Ä', Uuml: 'Ü', Euml: 'Ë', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Aacute: 'Á', Eacute: 'É', Ograve: 'Ò', Ugrave: 'Ù', Agrave: 'À', Egrave: 'È', Otilde: 'Õ', Ucirc: 'Û', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô', Atilde: 'Ã', Ntilde: 'Ñ', Ccedil: 'Ç', Aring: 'Å', Oslash: 'Ø', oslash: 'ø', ae: 'æ', oe: 'œ', yuml: 'ÿ', Yuml: 'Ÿ'
      }; // Add more as needed
      return entities[named] || match;
    } else if (dec) {
      return String.fromCharCode(Number(dec));
    } else if (hex) {
      return String.fromCharCode(parseInt(hex, 16));
    }
    return match;
  });
}
