import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const assetRoot = join(repoRoot, 'assets', 'workout-v2');
const sourceRoot = join(assetRoot, 'sources');
const masterRoot = join(assetRoot, 'masters');
const publicRoot = join(repoRoot, 'public', 'workout-v2');
const manifestPath = join(publicRoot, 'manifest.json');
const checkOnly = process.argv.includes('--check');
const verifyIdempotence = process.argv.includes('--verify-idempotence');
const maxDerivativeBytes = 450_000;
const maxPublicPayloadBytes = 2 * 1024 * 1024;
const canvasPaddingPct = 10;
const subjectSafeMarginPct = 11.25;

const definitions = [
  ['chest', 'anatomy', 'body-areas', ['pectoralis major', 'pectoralis minor']],
  ['back', 'anatomy', 'body-areas', ['trapezius', 'latissimus dorsi', 'rhomboids']],
  ['shoulders', 'anatomy', 'body-areas', ['anterior deltoid', 'lateral deltoid', 'posterior deltoid']],
  ['arms', 'anatomy', 'body-areas', ['biceps brachii', 'triceps brachii', 'forearm flexors']],
  ['legs', 'anatomy', 'body-areas', ['quadriceps', 'hamstrings', 'gluteus maximus', 'gastrocnemius']],
  ['core', 'anatomy', 'body-areas', ['rectus abdominis', 'external obliques', 'transverse abdominis']],
  ['full-body', 'anatomy', 'body-areas', ['pectorals', 'deltoids', 'core', 'quadriceps', 'latissimus dorsi']],
  ['cardio', 'cardio', 'body-areas', ['heart', 'lungs', 'gluteals', 'quadriceps', 'gastrocnemius']],
  ['bench-press', 'technique', 'exercises', ['pectoralis major', 'triceps brachii', 'anterior deltoid']],
  ['smith-bench-press', 'technique', 'exercises', ['pectoralis major', 'triceps brachii', 'anterior deltoid']],
  ['floor-press', 'technique', 'exercises', ['pectoralis major', 'triceps brachii']],
  ['machine-chest-press', 'technique', 'exercises', ['pectoralis major', 'triceps brachii', 'anterior deltoid']],
  ['push-up', 'technique', 'exercises', ['pectoralis major', 'triceps brachii', 'anterior deltoid', 'rectus abdominis']],
  ['incline-press', 'technique', 'exercises', ['clavicular pectoralis', 'triceps brachii', 'anterior deltoid']],
  ['overhead-press', 'technique', 'exercises', ['deltoids', 'triceps brachii', 'upper trapezius']],
  ['pec-deck', 'technique', 'exercises', ['pectoralis major', 'anterior deltoid']],
  ['cable-fly', 'technique', 'exercises', ['pectoralis major', 'anterior deltoid']],
  ['pull-up', 'technique', 'exercises', ['latissimus dorsi', 'biceps brachii', 'lower trapezius']],
  ['deadlift', 'technique', 'exercises', ['gluteus maximus', 'hamstrings', 'erector spinae', 'trapezius']],
  ['squat', 'technique', 'exercises', ['quadriceps', 'gluteus maximus', 'adductors']],
  ['dip', 'technique', 'exercises', ['pectoralis major', 'triceps brachii', 'anterior deltoid']],
  ['row', 'technique', 'exercises', ['latissimus dorsi', 'rhomboids', 'biceps brachii']],
  ['curl', 'technique', 'exercises', ['biceps brachii', 'brachialis', 'forearm flexors']],
  ['triceps-extension', 'technique', 'exercises', ['triceps brachii']],
];

const C = {
  ink: '#273036', ink2: '#39434A', line: '#657078',
  paper: '#F7F4EC', paper2: '#ECE7DC', rail: '#D8D1C4',
  coral: '#C84B57', coral2: '#E68A82', lime: '#6D9635', cyan: '#2B8292', violet: '#7155A2',
};

const digest = (value) => createHash('sha256').update(value).digest('hex');
const hashFile = async (path) => digest(await readFile(path));
const relative = (path) => path.slice(repoRoot.length + 1).replaceAll('\\', '/');
const publicSrc = (folder, slug) => `/workout-v2/${folder}/${slug}.webp`;

function settingsFor(kind) {
  return kind === 'technique'
    ? { master: { width: 3840, height: 2160 }, display: { width: 960, height: 540 }, quality: 84 }
    : { master: { width: 2160, height: 3840 }, display: { width: 540, height: 960 }, quality: 82 };
}

function vectorDefs() {
  return `<defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${C.paper}"/><stop offset="1" stop-color="${C.paper2}"/></linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4B565C"/><stop offset=".55" stop-color="${C.ink}"/><stop offset="1" stop-color="#171D20"/></linearGradient>
    <linearGradient id="muscle" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${C.coral2}"/><stop offset="1" stop-color="${C.coral}"/></linearGradient>
    <radialGradient id="halo"><stop stop-color="#FFFFFF" stop-opacity=".92"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#1D2529" flood-opacity=".13"/></filter>
  </defs>`;
}

function plate(kind) {
  return kind === 'technique'
    ? `<rect x="120" y="67.5" width="960" height="540" rx="58" fill="url(#paper)" stroke="${C.rail}" stroke-width="3"/><ellipse cx="600" cy="345" rx="400" ry="240" fill="url(#halo)"/><path d="M210 542H990" stroke="${C.rail}" stroke-width="3" stroke-linecap="round"/>`
    : `<rect x="54" y="96" width="432" height="768" rx="48" fill="url(#paper)" stroke="${C.rail}" stroke-width="2"/><ellipse cx="270" cy="420" rx="188" ry="300" fill="url(#halo)"/><path d="M132 806H408" stroke="${C.rail}" stroke-width="2" stroke-linecap="round"/>`;
}

function anatomyBase(back = false) {
  const torsoDetail = back
    ? `<path d="M228 306Q270 332 312 306M270 302V526M222 350Q244 410 232 482M318 350Q296 410 308 482" fill="none" stroke="#899297" stroke-width="5" stroke-linecap="round" opacity=".6"/>`
    : `<path d="M230 326Q270 352 310 326M270 310V526M244 410H296M246 456H294M248 500H292" fill="none" stroke="#899297" stroke-width="4" stroke-linecap="round" opacity=".6"/>`;
  return `<g id="subject" data-subject-safe-margin-pct="${subjectSafeMarginPct}">
    <ellipse cx="270" cy="807" rx="112" ry="20" fill="#1D2529" opacity=".12"/>
    <circle cx="270" cy="186" r="48" fill="url(#body)" stroke="${C.line}" stroke-width="3"/>
    ${back ? '<path d="M246 187Q270 173 294 187" fill="none" stroke="#869096" stroke-width="4" stroke-linecap="round" opacity=".55"/>' : '<path d="M250 186Q260 180 270 186Q280 180 290 186M262 205Q270 211 278 205" fill="none" stroke="#A7B0B4" stroke-width="3" stroke-linecap="round" opacity=".6"/>'}
    <path d="M250 228L245 264Q214 276 204 316L224 510Q234 554 246 574H294Q306 554 316 510L336 316Q326 276 295 264L290 228Z" fill="url(#body)" stroke="${C.line}" stroke-width="3"/>
    <path d="M208 304Q176 326 170 370L154 548Q151 574 169 580Q188 584 195 556L214 382" fill="url(#body)" stroke="${C.line}" stroke-width="3"/>
    <path d="M332 304Q364 326 370 370L386 548Q389 574 371 580Q352 584 345 556L326 382" fill="url(#body)" stroke="${C.line}" stroke-width="3"/>
    <path d="M246 564Q218 592 214 636L208 782Q208 811 229 814Q250 813 252 784L270 626L288 784Q290 813 311 814Q332 811 332 782L326 636Q322 592 294 564Z" fill="url(#body)" stroke="${C.line}" stroke-width="3"/>
    ${torsoDetail}
    <g fill="none" stroke="#909A9E" stroke-width="3" stroke-linecap="round" opacity=".5"><path d="M176 438L194 442"/><path d="M346 442L364 438"/><path d="M216 666L250 670"/><path d="M290 670L324 666"/></g>
  </g>`;
}

function anatomyHighlights(slug) {
  const muscle = `fill="url(#muscle)" stroke="${C.coral}" stroke-width="2" opacity=".96"`;
  const green = `fill="${C.lime}" stroke="#527826" stroke-width="2" opacity=".92"`;
  const cyan = `fill="${C.cyan}" stroke="#226A77" stroke-width="2" opacity=".94"`;
  const violet = `fill="${C.violet}" stroke="#594080" stroke-width="2" opacity=".94"`;
  const map = {
    chest: `<path d="M222 303Q243 282 267 306V364Q238 373 218 350Z" ${muscle}/><path d="M318 303Q297 282 273 306V364Q302 373 322 350Z" ${muscle}/>` ,
    back: `<path d="M224 294Q246 275 266 318L252 424Q223 408 216 342Z" ${cyan}/><path d="M316 294Q294 275 274 318L288 424Q317 408 324 342Z" ${cyan}/><path d="M244 274L270 308L296 274L286 356H254Z" ${violet}/>` ,
    shoulders: `<ellipse cx="211" cy="311" rx="27" ry="38" transform="rotate(22 211 311)" ${muscle}/><ellipse cx="329" cy="311" rx="27" ry="38" transform="rotate(-22 329 311)" ${muscle}/>` ,
    arms: `<path d="M190 347Q171 370 174 418L189 441Q206 405 207 358Z" ${muscle}/><path d="M350 347Q369 370 366 418L351 441Q334 405 333 358Z" ${muscle}/><path d="M171 441L158 548Q155 568 170 572Q184 570 192 548L194 444Z" ${cyan}/><path d="M369 441L382 548Q385 568 370 572Q356 570 348 548L346 444Z" ${cyan}/>` ,
    legs: `<path d="M244 577Q217 600 217 668L248 684L268 615Z" ${green}/><path d="M296 577Q323 600 323 668L292 684L272 615Z" ${green}/><path d="M218 681L211 777Q211 800 228 806Q246 800 249 778L252 692Z" ${muscle}/><path d="M322 681L329 777Q329 800 312 806Q294 800 291 778L288 692Z" ${muscle}/>` ,
    core: `<path d="M248 374Q270 362 292 374L294 512Q270 532 246 512Z" ${violet}/><path d="M224 376Q238 390 242 510L226 500Q214 432 218 386Z" ${cyan}/><path d="M316 376Q302 390 298 510L314 500Q326 432 322 386Z" ${cyan}/><path d="M270 376V516M248 418H292M247 462H293" fill="none" stroke="#D2C5E8" stroke-width="3" opacity=".7"/>` ,
    'full-body': `<path d="M222 303Q245 282 267 306V350Q240 360 220 344Z" ${muscle}/><path d="M318 303Q295 282 273 306V350Q300 360 320 344Z" ${muscle}/><ellipse cx="211" cy="311" rx="22" ry="31" ${cyan}/><ellipse cx="329" cy="311" rx="22" ry="31" ${cyan}/><path d="M250 378Q270 367 290 378L291 510Q270 526 249 510Z" ${violet}/><path d="M244 577Q218 604 218 671L250 679L268 614Z" ${green}/><path d="M296 577Q322 604 322 671L290 679L272 614Z" ${green}/>` ,
  };
  return map[slug] ?? '';
}

function cardioFigure() {
  return `<g id="subject" data-subject-safe-margin-pct="${subjectSafeMarginPct}">
    <ellipse cx="272" cy="801" rx="142" ry="19" fill="#1D2529" opacity=".13"/>
    <circle cx="292" cy="194" r="43" fill="url(#body)" stroke="${C.line}" stroke-width="3"/>
    <path d="M282 235Q235 270 230 360L275 458Q310 434 326 368L318 276Z" fill="url(#body)" stroke="${C.line}" stroke-width="3"/>
    <path d="M245 290L178 380L130 335" fill="none" stroke="url(#body)" stroke-width="35" stroke-linecap="round" stroke-linejoin="round"/><path d="M308 290L364 366L408 300" fill="none" stroke="url(#body)" stroke-width="35" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M274 445L206 588L118 713" fill="none" stroke="url(#body)" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/><path d="M290 445L338 594L423 704" fill="none" stroke="url(#body)" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M256 317Q275 291 302 319L300 389Q277 407 252 388Z" fill="${C.cyan}" opacity=".78"/><path d="M272 344C272 327 294 326 294 344C294 360 283 368 283 368C283 368 272 360 272 344Z" fill="${C.coral}"/>
    <path d="M253 442L216 532" stroke="${C.lime}" stroke-width="34" stroke-linecap="round"/><path d="M294 448L326 548" stroke="${C.lime}" stroke-width="34" stroke-linecap="round"/><path d="M196 601L142 679" stroke="${C.coral}" stroke-width="28" stroke-linecap="round"/><path d="M350 610L405 679" stroke="${C.coral}" stroke-width="28" stroke-linecap="round"/>
    <path d="M93 735H173M385 729H464" stroke="${C.ink}" stroke-width="20" stroke-linecap="round"/>
  </g>`;
}

function anatomySvg(slug, kind) {
  const body = slug === 'cardio' ? cardioFigure() : `${anatomyBase(slug === 'back')}${anatomyHighlights(slug)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2160" height="3840" viewBox="0 0 540 960" role="img" data-generator="repo-native-vector" data-subject-safe-margin-pct="${subjectSafeMarginPct}">${vectorDefs()}${plate(kind)}${body}</svg>\n`;
}

const point = (x, y) => `${x} ${y}`;
function line(a, b, width = 42, color = C.ink2) { return `<path d="M${point(...a)}L${point(...b)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`; }
function head([x, y], r = 38) { return `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#body)" stroke="${C.line}" stroke-width="4"/><path d="M${x + r * .2} ${y - r * .2}L${x + r * .58} ${y}" stroke="#A1AAAE" stroke-width="4" stroke-linecap="round"/>`; }
function highlight(a, b, color = C.coral, width = 28) { return line(a, b, width, color); }
function torso(points, color = 'url(#body)') { return `<path d="M${point(...points[0])}L${point(...points[1])}L${point(...points[2])}L${point(...points[3])}Z" fill="${color}" stroke="${C.line}" stroke-width="4" stroke-linejoin="round"/>`; }
function barbell(x1, y1, x2, y2) { return `<g stroke="${C.ink}" stroke-linecap="round"><path d="M${x1} ${y1}L${x2} ${y2}" stroke-width="12"/><path d="M${x1 + 35} ${y1 - 34}L${x1 + 35} ${y1 + 34}M${x1 + 52} ${y1 - 44}L${x1 + 52} ${y1 + 44}M${x2 - 35} ${y2 - 34}L${x2 - 35} ${y2 + 34}M${x2 - 52} ${y2 - 44}L${x2 - 52} ${y2 + 44}" stroke-width="14"/></g>`; }
function dumbbell(x, y, rotate = 0) { return `<g transform="rotate(${rotate} ${x} ${y})" stroke="${C.ink}" stroke-width="12" stroke-linecap="round"><path d="M${x - 30} ${y}H${x + 30}"/><path d="M${x - 36} ${y - 18}V${y + 18}M${x + 36} ${y - 18}V${y + 18}"/></g>`; }
const floor = () => `<path d="M170 542H1030" stroke="${C.rail}" stroke-width="3" stroke-linecap="round"/>`;

function exerciseArt(slug) {
  const arts = {
    'bench-press': `<g id="subject">${floor()}<path d="M330 448H770M390 448V520M720 448V520" stroke="${C.ink}" stroke-width="18" stroke-linecap="round"/>${barbell(360,210,860,210)}${head([472,337],34)}${torso([[500,330],[680,328],[700,390],[502,392]])}${line([505,350],[570,245])}${line([670,350],[740,245])}${line([570,245],[570,210],30)}${line([740,245],[740,210],30)}${line([690,375],[790,405])}${line([790,405],[850,500])}${highlight([520,342],[650,342],C.coral,34)}${highlight([525,335],[570,245],C.coral,24)}${highlight([665,335],[740,245],C.coral,24)}</g>`,
    'smith-bench-press': `<g id="subject">${floor()}<path d="M250 120V535M950 120V535M225 120H275M925 120H975" stroke="${C.ink}" stroke-width="18" stroke-linecap="round"/><path d="M330 448H770M390 448V520M720 448V520" stroke="${C.ink}" stroke-width="18" stroke-linecap="round"/>${barbell(300,210,900,210)}<path d="M300 210H250M900 210H950" stroke="${C.cyan}" stroke-width="10" stroke-linecap="round"/>${head([472,337],34)}${torso([[500,330],[680,328],[700,390],[502,392]])}${line([505,350],[570,245])}${line([670,350],[740,245])}${line([570,245],[570,210],30)}${line([740,245],[740,210],30)}${line([690,375],[790,405])}${line([790,405],[850,500])}${highlight([520,342],[650,342],C.coral,34)}${highlight([525,335],[570,245],C.coral,24)}${highlight([665,335],[740,245],C.coral,24)}</g>`,
    'floor-press': `<g id="subject">${floor()}${barbell(345,245,855,245)}${head([455,430],33)}${torso([[490,390],[675,388],[700,452],[488,454]])}${line([510,402],[565,285])}${line([665,402],[735,285])}${line([565,285],[565,245],28)}${line([735,285],[735,245],28)}${line([685,438],[790,455])}${line([790,455],[860,520])}${line([515,445],[400,474])}${highlight([518,405],[648,402],C.coral,34)}${highlight([520,395],[565,285],C.coral,22)}${highlight([662,395],[735,285],C.coral,22)}</g>`,
    'machine-chest-press': `<g id="subject">${floor()}<path d="M390 220V515H755V220M385 515H765" stroke="${C.ink}" stroke-width="18" stroke-linecap="round"/><path d="M440 345H350M760 345H850M350 345V250M850 345V250" stroke="${C.cyan}" stroke-width="14" stroke-linecap="round"/>${head([600,240],35)}${torso([[530,290],[670,290],[650,425],[550,425]])}${line([540,310],[470,350])}${line([470,350],[390,345],28)}${line([660,310],[730,350])}${line([730,350],[810,345],28)}${line([575,425],[555,510])}${line([625,425],[645,510])}${highlight([545,306],[590,345],C.coral,34)}${highlight([655,306],[610,345],C.coral,34)}${highlight([532,313],[470,350],C.coral,22)}${highlight([668,313],[730,350],C.coral,22)}</g>`,
    'push-up': `<g id="subject">${floor()}${head([860,342],32)}${torso([[805,355],[680,382],[610,430],[770,402]])}${line([700,398],[555,430],38)}${line([555,430],[390,476],38)}${line([785,385],[800,455],28)}${line([800,455],[850,520],26)}${line([710,410],[690,470],28)}${line([690,470],[720,520],26)}${highlight([770,375],[690,400],C.coral,30)}${highlight([790,388],[800,455],C.coral,20)}<path d="M680 398L548 433" stroke="${C.violet}" stroke-width="20" stroke-linecap="round" opacity=".9"/><path d="M390 520H900" stroke="${C.rail}" stroke-width="4" stroke-linecap="round"/></g>`,
    'incline-press': `<g id="subject">${floor()}<path d="M390 465L690 280M390 465L360 520M690 280L720 520" stroke="${C.ink}" stroke-width="18" stroke-linecap="round"/>${head([570,264],34)}${torso([[590,286],[695,367],[660,430],[540,330]])}${line([586,302],[500,205])}${line([675,360],[770,250])}${line([540,330],[485,205])}${line([695,375],[785,250])}${line([650,420],[760,455])}${line([760,455],[815,520])}${dumbbell(492,192,-10)}${dumbbell(778,238,10)}${highlight([585,302],[668,366],C.coral,34)}${highlight([584,297],[500,205],C.coral,24)}${highlight([677,352],[770,250],C.coral,24)}</g>`,
    'overhead-press': `<g id="subject">${floor()}${barbell(350,145,850,145)}${head([600,245],38)}${torso([[535,292],[665,292],[646,440],[554,440]])}${line([548,310],[470,220])}${line([470,220],[470,145],32)}${line([652,310],[730,220])}${line([730,220],[730,145],32)}${line([570,438],[545,520])}${line([630,438],[655,520])}${highlight([548,307],[490,236],C.coral,28)}${highlight([652,307],[710,236],C.coral,28)}<path d="M536 298Q600 264 664 298L646 330Q600 310 554 330Z" fill="${C.violet}" opacity=".9"/></g>`,
    'pec-deck': `<g id="subject">${floor()}<path d="M442 250V510H760V250M432 510H770" stroke="${C.ink}" stroke-width="18" stroke-linecap="round"/><path d="M435 245L350 190M765 245L850 190" stroke="${C.line}" stroke-width="12"/>${head([600,230],36)}${torso([[525,282],[675,282],[655,430],[545,430]])}${line([540,305],[475,340])}${line([475,340],[430,255],30)}${line([660,305],[725,340])}${line([725,340],[770,255],30)}${line([570,430],[550,510])}${line([630,430],[650,510])}${highlight([545,300],[590,340],C.coral,34)}${highlight([655,300],[610,340],C.coral,34)}${highlight([532,306],[475,340],C.coral,22)}${highlight([668,306],[725,340],C.coral,22)}</g>`,
    'cable-fly': `<g id="subject">${floor()}<path d="M220 130V525M980 130V525M180 130H260M940 130H1020" stroke="${C.ink}" stroke-width="18" stroke-linecap="round"/>${head([600,220],36)}${torso([[535,270],[665,270],[645,410],[555,410]])}${line([540,290],[465,330],34)}${line([465,330],[565,350],28)}${line([660,290],[735,330],34)}${line([735,330],[635,350],28)}<path d="M220 160L465 330M980 160L735 330" stroke="${C.line}" stroke-width="5"/>${line([575,410],[540,520])}${line([625,410],[680,520])}${highlight([545,286],[590,327],C.coral,34)}${highlight([655,286],[610,327],C.coral,34)}${highlight([535,292],[470,328],C.coral,22)}${highlight([665,292],[730,328],C.coral,22)}</g>`,
    'pull-up': `<g id="subject">${floor()}<path d="M300 125H900" stroke="${C.ink}" stroke-width="22" stroke-linecap="round"/>${head([600,270],36)}${torso([[535,320],[665,320],[640,445],[560,445]])}${line([545,330],[475,230])}${line([475,230],[420,130],30)}${line([655,330],[725,230])}${line([725,230],[780,130],30)}${line([580,445],[555,530])}${line([620,445],[645,530])}<path d="M540 324Q600 345 660 324L642 425Q600 395 558 425Z" fill="${C.cyan}" opacity=".92"/>${highlight([535,320],[475,230],C.coral,22)}${highlight([665,320],[725,230],C.coral,22)}</g>`,
    deadlift: `<g id="subject">${floor()}${barbell(300,493,900,493)}${head([675,240],34)}${torso([[625,275],[710,300],[635,410],[545,370]])}${line([625,300],[560,400])}${line([560,400],[520,493],30)}${line([675,315],[620,410])}${line([620,410],[680,493],30)}${line([560,380],[490,455])}${line([490,455],[455,520])}${line([630,400],[720,445])}${line([720,445],[780,520])}${highlight([558,382],[492,450],C.lime,34)}${highlight([630,402],[716,445],C.lime,34)}${highlight([645,286],[590,374],C.cyan,30)}<path d="M552 365Q590 350 632 390L612 424Q570 414 540 388Z" fill="${C.coral}" opacity=".88"/></g>`,
    squat: `<g id="subject">${floor()}${barbell(340,235,860,235)}${head([620,225],33)}${torso([[550,270],[680,270],[650,395],[555,380]])}${line([565,375],[480,435])}${line([480,435],[395,510])}${line([635,390],[740,425])}${line([740,425],[820,510])}${line([560,285],[470,235],30)}${line([670,285],[750,235],30)}${highlight([565,378],[485,432],C.lime,38)}${highlight([635,390],[735,424],C.lime,38)}<path d="M555 365Q600 350 650 390L630 420Q590 404 548 392Z" fill="${C.coral}" opacity=".9"/></g>`,
    dip: `<g id="subject">${floor()}<path d="M350 340H535M665 340H850M390 340V520M810 340V520" stroke="${C.ink}" stroke-width="18" stroke-linecap="round"/>${head([600,202],35)}${torso([[535,255],[665,255],[642,394],[558,394]])}${line([545,278],[515,340])}${line([515,340],[530,418],30)}${line([655,278],[685,340])}${line([685,340],[670,418],30)}${line([580,394],[565,500])}${line([620,394],[635,500])}${highlight([540,270],[585,315],C.coral,34)}${highlight([660,270],[615,315],C.coral,34)}${highlight([530,280],[515,340],C.coral,22)}${highlight([670,280],[685,340],C.coral,22)}</g>`,
    row: `<g id="subject">${floor()}<path d="M870 180V520M835 180H905M850 330H890" stroke="${C.ink}" stroke-width="18" stroke-linecap="round"/>${head([540,260],33)}${torso([[500,295],[600,310],[625,420],[515,410]])}${line([590,325],[690,360])}${line([690,360],[850,330],28)}${line([520,405],[430,450])}${line([430,450],[350,510])}${line([600,420],[700,470])}${line([700,470],[760,515])}${highlight([590,322],[685,358],C.coral,22)}<path d="M505 300Q550 345 605 320L620 405Q555 380 518 400Z" fill="${C.cyan}" opacity=".92"/></g>`,
    curl: `<g id="subject">${floor()}${head([600,210],36)}${torso([[535,260],[665,260],[645,410],[555,410]])}${line([545,285],[500,375])}${line([500,375],[455,315])}${line([655,285],[700,375])}${line([700,375],[745,315])}${line([575,410],[550,520])}${line([625,410],[650,520])}${dumbbell(442,302,-20)}${dumbbell(758,302,20)}${highlight([545,286],[500,375],C.coral,30)}${highlight([655,286],[700,375],C.coral,30)}${highlight([500,375],[460,320],C.cyan,20)}${highlight([700,375],[740,320],C.cyan,20)}</g>`,
    'triceps-extension': `<g id="subject">${floor()}<path d="M905 125V520M870 125H940M880 250H930" stroke="${C.ink}" stroke-width="18" stroke-linecap="round"/>${head([570,205],35)}${torso([[510,255],[640,270],[620,415],[530,405]])}${line([620,295],[700,310])}${line([700,310],[730,410],30)}${line([570,410],[545,520])}${line([610,415],[660,520])}<path d="M905 145L700 310" stroke="${C.line}" stroke-width="5"/><path d="M705 410H760" stroke="${C.ink}" stroke-width="12" stroke-linecap="round"/>${highlight([625,292],[698,310],C.coral,28)}${highlight([700,310],[730,405],C.coral,24)}</g>`,
  };
  return arts[slug];
}

function exerciseSvg(slug) {
  const art = exerciseArt(slug);
  if (!art) throw new Error(`${slug}: missing vector composition`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160" viewBox="0 0 1200 675" role="img" data-generator="repo-native-vector" data-subject-safe-margin-pct="${subjectSafeMarginPct}">${vectorDefs()}${plate('technique')}${art}</svg>\n`;
}

const sourceSvg = (slug, kind) => kind === 'technique' ? exerciseSvg(slug) : anatomySvg(slug, kind);

function alphaMargin(data, width, height, channels) {
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * channels + 3] > 24) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error('no opaque vector pixels found');
  return Math.min(left / width, (width - 1 - right) / width, top / height, (height - 1 - bottom) / height) * 100;
}

async function inspectRaster(path) {
  const [metadata, raw] = await Promise.all([sharp(path).metadata(), sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
  return { metadata, safeMarginPct: Number(alphaMargin(raw.data, raw.info.width, raw.info.height, raw.info.channels).toFixed(2)) };
}

async function createEntry(slug, kind, folder, muscles) {
  const settings = settingsFor(kind);
  const sourcePath = join(sourceRoot, `${slug}.svg`);
  const masterPath = join(masterRoot, `${slug}.webp`);
  const displayPath = join(publicRoot, folder, `${slug}.webp`);
  const svg = sourceSvg(slug, kind);
  await Promise.all([mkdir(sourceRoot, { recursive: true }), mkdir(masterRoot, { recursive: true }), mkdir(join(publicRoot, folder), { recursive: true })]);
  await writeFile(sourcePath, svg);
  await sharp(Buffer.from(svg), { density: 192 }).resize(settings.master.width, settings.master.height, { fit: 'fill' }).webp({ quality: 92, alphaQuality: 100, effort: 4, smartSubsample: true }).toFile(masterPath);
  await sharp(Buffer.from(svg), { density: 96 }).resize(settings.display.width, settings.display.height, { fit: 'fill' }).webp({ quality: settings.quality, alphaQuality: 100, effort: 6, smartSubsample: true }).toFile(displayPath);
  return inspectEntry(slug, kind, folder, muscles);
}

async function inspectEntry(slug, kind, folder, muscles) {
  const settings = settingsFor(kind);
  const sourcePath = join(sourceRoot, `${slug}.svg`);
  const masterPath = join(masterRoot, `${slug}.webp`);
  const displayPath = join(publicRoot, folder, `${slug}.webp`);
  const source = await readFile(sourcePath, 'utf8');
  if (source !== sourceSvg(slug, kind)) throw new Error(`${slug}: source SVG drift`);
  if (/<(?:image|text)\b|(?:href|src)\s*=|data:image|base64,/i.test(source)) throw new Error(`${slug}: SVG must contain only native vector geometry and no rendered text`);
  const [master, display, sourceHash, masterHash, displayHash] = await Promise.all([inspectRaster(masterPath), inspectRaster(displayPath), hashFile(sourcePath), hashFile(masterPath), hashFile(displayPath)]);
  return {
    kind, src: publicSrc(folder, slug),
    source: { path: relative(sourcePath), type: 'vector', format: 'svg', scalable: true, width: settings.master.width, height: settings.master.height, sha256: sourceHash, safeMarginPct: canvasPaddingPct, subjectSafeMarginPct },
    master: { path: relative(masterPath), width: master.metadata.width, height: master.metadata.height, upscaled: false, sha256: masterHash, canvasPaddingPct, format: 'webp', hasAlpha: master.metadata.hasAlpha === true, safeMarginPct: master.safeMarginPct, subjectSafeMarginPct },
    display: { width: display.metadata.width, height: display.metadata.height, quality: settings.quality, hasAlpha: display.metadata.hasAlpha === true, sha256: displayHash, safeMarginPct: display.safeMarginPct, subjectSafeMarginPct },
    safeMarginPct: display.safeMarginPct, generatorMode: 'repo-native-svg', background: 'warm-neutral-vector-plate', semanticMuscles: muscles, fallbackLabel: 'anatomy',
  };
}

async function buildManifest(regenerate) {
  const entries = {};
  for (const [slug, kind, folder, muscles] of definitions) entries[slug] = regenerate ? await createEntry(slug, kind, folder, muscles) : await inspectEntry(slug, kind, folder, muscles);
  return { version: 3, sourceContract: 'native-vector-4k-v1', assets: entries };
}

async function validateManifest() {
  const actualText = await readFile(manifestPath, 'utf8');
  const actual = JSON.parse(actualText);
  const expected = await buildManifest(false);
  if (actualText !== `${JSON.stringify(expected, null, 2)}\n`) throw new Error('manifest drift: vector sources, dimensions, margins, alpha, semantics, or hashes differ');
  let payloadBytes = Buffer.byteLength(actualText);
  for (const [slug, kind, folder, muscles] of definitions) {
    const entry = actual.assets[slug]; const settings = settingsFor(kind);
    if (!entry || entry.src !== publicSrc(folder, slug) || entry.kind !== kind || entry.generatorMode !== 'repo-native-svg') throw new Error(`${slug}: manifest config drift`);
    if (entry.source.type !== 'vector' || entry.source.format !== 'svg' || entry.source.scalable !== true) throw new Error(`${slug}: source is not resolution-independent SVG`);
    if (entry.source.width !== settings.master.width || entry.source.height !== settings.master.height) throw new Error(`${slug}: source dimensions are not true 4K`);
    if (entry.master.width !== settings.master.width || entry.master.height !== settings.master.height || entry.master.upscaled !== false || entry.master.format !== 'webp') throw new Error(`${slug}: master dimensions or no-upscale contract drift`);
    if (entry.display.width !== settings.display.width || entry.display.height !== settings.display.height) throw new Error(`${slug}: display dimensions drift`);
    if (entry.source.subjectSafeMarginPct < 10 || entry.master.subjectSafeMarginPct < 10 || entry.display.subjectSafeMarginPct < 10) throw new Error(`${slug}: complete subject/equipment safety margin is below 10%`);
    if (entry.safeMarginPct < 9.5 || entry.master.canvasPaddingPct !== canvasPaddingPct || entry.master.safeMarginPct < 9.5 || entry.display.safeMarginPct < 9.5) throw new Error(`${slug}: vector plate safety margin is below threshold`);
    if (entry.master.hasAlpha !== true || entry.display.hasAlpha !== true || entry.background !== 'warm-neutral-vector-plate') throw new Error(`${slug}: light/dark background contract drift`);
    if (JSON.stringify(entry.semanticMuscles) !== JSON.stringify(muscles)) throw new Error(`${slug}: muscle semantics drift`);
    const displayPath = join(repoRoot, 'public', entry.src.slice(1)); const displayStat = await stat(displayPath); payloadBytes += displayStat.size;
    if (displayStat.size >= maxDerivativeBytes) throw new Error(`${slug}: display derivative exceeds ${maxDerivativeBytes} bytes`);
  }
  if (payloadBytes >= maxPublicPayloadBytes) throw new Error(`public workout payload is ${payloadBytes} bytes, over ${maxPublicPayloadBytes}`);
  console.log(`Workout artwork check passed: ${definitions.length} native SVG sources, true 4K no-upscale masters, ${payloadBytes} runtime bytes, and deterministic hashes.`);
}

async function fingerprints() {
  const paths = [manifestPath];
  for (const [slug, , folder] of definitions) paths.push(join(sourceRoot, `${slug}.svg`), join(masterRoot, `${slug}.webp`), join(publicRoot, folder, `${slug}.webp`));
  return Promise.all(paths.map(async (path) => `${relative(path)}:${await hashFile(path)}`));
}

if (checkOnly) await validateManifest();
else {
  const manifest = await buildManifest(true);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await validateManifest();
  if (verifyIdempotence) {
    const first = await fingerprints();
    const repeated = await buildManifest(true);
    await writeFile(manifestPath, `${JSON.stringify(repeated, null, 2)}\n`);
    await validateManifest();
    const second = await fingerprints();
    if (first.join('\n') !== second.join('\n')) throw new Error('byte idempotence failed: a second vector render changed output bytes');
    console.log('Workout native-vector byte-idempotence check passed.');
  }
}
