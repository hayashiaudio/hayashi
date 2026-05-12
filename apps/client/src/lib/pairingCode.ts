const WORDS = [
  'amber','azure','calm','clear','cool','crisp','dark','deep','drift','dusk',
  'dust','echo','even','fair','fast','fierce','fine','firm','flat','fleet',
  'fluid','fog','forest','fresh','gale','gentle','glad','gold','grand','gray',
  'green','grim','hale','hazy','high','hollow','holy','hush','iron','ivory',
  'jade','jet','keen','kind','lake','late','light','lime','lone','long',
  'lost','loud','low','lush','mild','mist','moon','mute','near','neon',
  'new','nice','night','noble','noon','north','oaken','old','olive','open',
  'pale','past','peak','plum','proud','quiet','rapid','rare','raw','red',
  'rich','ripe','river','road','rough','royal','ruby','rude','rust','safe',
  'sage','salt','sand','sea','sharp','short','silent','silver','slow','small',
  'smooth','snow','soft','solid','sour','spare','stark','steel','still','stone',
  'storm','stout','strong','sudden','summer','sunny','sure','sweet','swift','tall',
  'tame','tawny','teal','tender','thick','thin','tight','tough','true','twin',
  'vast','warm','west','wet','white','wild','wind','winter','wise','young',
];

export function generatePairingCode(): string {
  const w1 = WORDS[Math.floor(Math.random() * WORDS.length)];
  const w2 = WORDS[Math.floor(Math.random() * WORDS.length)];
  const num = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${w1}-${w2}-${num}`;
}
