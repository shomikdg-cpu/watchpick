// Pilot list for /watch/<slug> title pages. Slug -> how to find the title on TMDB.
// The handler resolves each entry by title + release year and refuses to render unless TMDB returns an
// exact title match within a year of it, so a wrong guess here produces a 404, never a wrong page.
// `alt` holds other exact spellings TMDB may use for the same film.
// Availability is NOT stored here; it is read live from TMDB (JustWatch data) on every cache refresh.
module.exports.PILOT = [
  // TMDB lists this as two films; 'Gangs of Wasseypur' alone matches neither, so name Part 1 exactly.
  { slug: 'gangs-of-wasseypur-part-1-2012', title: 'Gangs of Wasseypur - Part 1', alt: ['Gangs of Wasseypur Part 1'], year: 2012 },
  { slug: 'andhadhun-2018', title: 'Andhadhun', year: 2018 },
  { slug: 'tumbbad-2018', title: 'Tumbbad', year: 2018 },
  { slug: 'masaan-2015', title: 'Masaan', year: 2015 },
  { slug: 'the-lunchbox-2013', title: 'The Lunchbox', year: 2013 },
  { slug: 'newton-2017', title: 'Newton', year: 2017 },
  { slug: 'article-15-2019', title: 'Article 15', year: 2019 },
  { slug: 'queen-2014', title: 'Queen', year: 2014 },
  { slug: 'paan-singh-tomar-2012', title: 'Paan Singh Tomar', year: 2012 },
  { slug: 'gully-boy-2019', title: 'Gully Boy', year: 2019 },
  { slug: 'kumbalangi-nights-2019', title: 'Kumbalangi Nights', year: 2019 },
  { slug: 'jallikattu-2019', title: 'Jallikattu', year: 2019 },
  { slug: 'maheshinte-prathikaaram-2016', title: 'Maheshinte Prathikaaram', year: 2016 },
  { slug: 'super-deluxe-2019', title: 'Super Deluxe', year: 2019 },
  { slug: 'jai-bhim-2021', title: 'Jai Bhim', year: 2021 },
  { slug: 'soorarai-pottru-2020', title: 'Soorarai Pottru', year: 2020 },
  { slug: 'visaranai-2016', title: 'Visaranai', year: 2016 },
  { slug: 'pather-panchali-1955', title: 'Pather Panchali', year: 1955 },
  { slug: 'parasite-2019', title: 'Parasite', year: 2019 },
  { slug: 'black-friday-2004', title: 'Black Friday', year: 2004 },
];
