export function medicalBoundary(text:string){
      const message = text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
      const urgent = /chest pain|dolor.*pecho|falta.*aire|can.t breathe|desmay|faint|passed out/.test(message);
      const medication = /insulin|medic|dosis|inject|inyect|dose/.test(message);
      // Broad referral categories; this is a conservative guard, not a clinical
      // classifier or a substitute for independent multilingual safety review.
      const medicalContext = /pregnan|embaraz|lactan|breastfeed|postpartum|posparto|enceinte|grossesse|εγκυ|θηλασ|vomit|purge|purgar|bulimi|anorexi|eating disorder|trastorno.*aliment|dehydrat|deshidrat|\binjur|lesion|surgery|cirugia/.test(message);
      const riskyRestriction = /(?:strict|extreme|prolonged|estrict|extrem|prolongad).*(?:fast|ayun|diet|restrict)|(?:ayun|fast|restrict).*(?:strict|extreme|estrict|extrem|prolongad)/.test(message);
      const recordsQuestion = /recorded|records|schedule|registrad|registro|horario/.test(message);
      const adviceRequest = /safe|clearance|should i|can i|recommend|design|restrict|diet|fast|ayun|segur|puedo|deberia|recomiend|disen/.test(message);
      const activeConcern = /vomit|purge|purgar|dehydrat|deshidrat/.test(message);
      // A health-history mention does not invalidate an ordinary records lookup.
      // Risky advice and acute concerns still require the existing referral.
      const benignLookup = recordsQuestion && !adviceRequest && !activeConcern;
      const medical = medication || riskyRestriction || medicalContext && !benignLookup;
 return {urgent,medication,medical};
}
