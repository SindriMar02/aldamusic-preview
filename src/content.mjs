export { ARTISTS, RELEASES } from './roster.mjs';

export const META = {
  name: 'Alda Music',
  domain: 'aldamusic.is',
  title: 'Alda Music · íslensk tónlist frá 1975',
  description:
    'Alda Music gefur út og heldur til haga stórum hluta þess sem hefur verið hljóðritað á Íslandi. '
    + '54 listamenn, plötubúð á Eyjarslóð 7 og netverslun.',
  address: 'Eyjarslóð 7, 101 Reykjavík',
  email: 'alda@aldamusic.is',
  phone: '+354 546 2202',
  phoneHref: '+3545462202',
  shop: 'https://netverslun.aldamusic.is/',
  hours: [
    ['Mánudaga til föstudaga', '10–18'],
    ['Laugardaga', '12–17'],
    ['Sunnudaga', 'Lokað'],
  ],
  social: [
    ['Instagram', 'https://www.instagram.com/aldamusic.is/'],
    ['Facebook', 'https://www.facebook.com/aldamusic.is'],
    ['YouTube', 'https://www.youtube.com/channel/UC2B1WZ4RCykRQz4HDuJfjqA'],
    ['X', 'https://twitter.com/aldamusicis?lang=en'],
  ],
  legal: [
    ['Skilmálar', 'https://netverslun.aldamusic.is/pages/terms-1'],
    ['Sending og skil', 'https://netverslun.aldamusic.is/pages/delivery-returns'],
    ['Höfundarréttur', 'https://netverslun.aldamusic.is/pages/copyright-privacy'],
  ],
};

export const NAV = [
  ['Plötur', '#plotur'],
  ['Listafólk', '#listafolk'],
  ['Aldamót', '#aldamot'],
  ['Netverslun', META.shop],
];

export const HERO = {
  /* Two lines so the wordmark can sit as one solid word and one hollow word, the way a
     label stamp reads. Not split per character: Icelandic accents need the whole line. */
  markLines: ['ALDA', 'MUSIC'],
  eyebrow: 'Reykjavík · síðan 1975',
  lead:
    'Við gefum út íslenska tónlist og höldum til haga stórum hluta þess sem hefur verið '
    + 'hljóðritað hér. Frá Skífunni til Öldu, á plötu og í streymi.',
  scroll: 'Skruna',
  play: 'Hlusta',
  tickerLabel: 'Nýtt á plötu',
};

export const SHOP = {
  eyebrow: 'Plötubúðin',
  title: 'Plötur',
  lead:
    'Allt sem hér stendur er til í búðinni á Eyjarslóð og í netversluninni. '
    + 'Dragðu röðina til hliðar.',
  drag: 'Dragðu',
  cta: 'Opna netverslun',
  priceNote: 'Verð lesin úr netverslun 26. júlí 2026.',
};

export const ROSTER = {
  eyebrow: 'Listafólkið',
  title: 'Listafólk',
  lead: 'Fimmtíu og fjórir listamenn eru á skrá hjá Öldu. Skrunaðu niður listann.',
  hint: 'Nafnið í miðjunni er valið',
  countLabel: 'af 54',
};

export const HISTORY = {
  eyebrow: 'Aldamót',
  title: 'Frá Skífunni til Öldu',
  lead:
    'Sama fyrirtæki, fjögur nöfn og fimmtíu ár. Dragðu tímalínuna til hliðar.',
  drag: 'Dragðu tímalínuna',
  items: [
    {
      year: '1975',
      head: 'Skífan',
      tag: 'Hafnarfjörður',
      body:
        'Jón Ólafsson opnar fyrstu hljómplötuverslun Skífunnar í Hafnarfirði. Búðin verður '
        + 'útgáfa, og sú útgáfa verður grunnurinn að öllu sem kemur á eftir.',
    },
    {
      year: '2005',
      head: 'Sena',
      tag: 'Nýtt nafn',
      body:
        'Skífunni er breytt í Senu. Útgáfan heldur áfram að safna útgáfurétti á íslenskri '
        + 'tónlist á meðan fyrirtækið sjálft færist yfir í viðburði, bíó og dreifingu.',
    },
    {
      year: '2016',
      head: 'Alda Music',
      tag: 'Útgáfan tekur sig út',
      body:
        'Alda Music er stofnuð og kaupir útgáfurétt Senu í júlí. Sölvi Blöndal og Ólafur '
        + 'Arnalds eru meðal þeirra sem stofna hana. Tónlistin fær sitt eigið hús.',
    },
    {
      year: '2022',
      head: 'Universal',
      tag: 'Alþjóðleg dreifing',
      body:
        'Universal Music Group kaupir Öldu fyrir um 1,7 milljarða króna. Sölvi heldur áfram '
        + 'með hópnum og íslenski katalógurinn fer inn í stærsta dreifikerfi heims.',
    },
    {
      year: 'Núna',
      head: 'Eyjarslóð 7',
      tag: 'Reykjavík 101',
      body:
        'Fimmtíu og fjórir listamenn á skrá, plötubúð opin sex daga vikunnar og netverslun '
        + 'sem sendir hvert sem er. Sama katalógur, fimmtíu árum síðar.',
    },
  ],
};

export const PARENT = {
  eyebrow: 'Móðurfélag',
  title: 'Hluti af Universal Music Group',
  body:
    'Alda Music hefur verið hluti af Universal Music Group síðan 2022. Íslensk útgáfa, '
    + 'íslenskt starfsfólk, alþjóðleg dreifing.',
  link: ['Universal Music Group', 'https://www.universalmusic.com/'],
};

export const CTA = {
  head: 'Ertu með eitthvað sem við eigum að heyra?',
  body:
    'Sendu okkur hlekk á tónlistina þína. Það þarf ekki að vera fullgerð plata, hugmynd '
    + 'og upptaka er nóg til að byrja.',
  action: 'Senda tónlist',
  subject: 'Tónlist til Öldu',
  secondary: 'Koma í búðina',
};

export const FOOTER = {
  head: 'Alda Music',
  shopLabel: 'Plötubúðin',
  hoursLabel: 'Opnunartími',
  contactLabel: 'Samband',
  socialLabel: 'Samfélagsmiðlar',
  legalLabel: 'Skilmálar',
  credit:
    'Frumgerð eftir Sindra Má. Myndir af listafólki og plötuumslög eru úr eigin efni '
    + 'Alda Music. Bakgrunnsmyndin í haus er tölvugerð. Þetta er ekki opinber vefur '
    + 'fyrirtækisins.',
};
