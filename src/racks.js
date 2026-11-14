// Rack codes from the shelf plan, in the order a person walks the shop.
export const RACKS = {
  R1: { hi: 'दाईं दीवार · रैक 1 (दरवाज़े के पास)', en: 'Right wall rack 1, by the door' },
  R2: { hi: 'दाईं दीवार · रैक 2', en: 'Right wall rack 2' },
  R3: { hi: 'दाईं दीवार · रैक 3', en: 'Right wall rack 3' },
  R4: { hi: 'दाईं दीवार · रैक 4 (पीछे कोने में)', en: 'Right wall rack 4, back corner' },
  B1: { hi: 'पीछे की दीवार · दायां रैक', en: 'Back wall, right rack' },
  B2: { hi: 'पीछे की दीवार · बायां रैक', en: 'Back wall, left rack' },
  L2: { hi: 'बाईं दीवार · रैक 2 (फ्रीज़र के बाद)', en: 'Left wall rack 2, after the freezer' },
  L1: { hi: 'बाईं दीवार · रैक 1 (काउंटर के पास)', en: 'Left wall rack 1, by the counter' },
  C: { hi: 'काउंटर', en: 'Front counter' },
  DF: { hi: 'डीप फ्रीज़र', en: 'Deep freezer' },
  CH: { hi: 'चिलर', en: 'Chiller' },
  ST: { hi: 'स्टेशनरी (R1–R2 के ऊपर)', en: 'Stationery, top of R1–R2' },
  FL: { hi: 'फ़र्श', en: 'Floor' },
  H: { hi: 'घर का स्टॉक', en: 'Home stock' }
};

export const rackText = (code) => (RACKS[code] ? code + ' · ' + RACKS[code].hi : code || '');
