import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import { CHARACTERS, type Character } from './characters';
import { patternImage } from './patterns';

const BRAND_NAME = 'Card & TW ＆ Game';
const TRANSITION_MS = 650;
const EASING = 'cubic-bezier(0.4,0,0.2,1)';
const portraitUrl = (id: number) => `${import.meta.env.BASE_URL}characters/portrait-${String(id).padStart(2, '0')}.png`;
type Role = 'center' | 'left' | 'right' | 'back' | 'hidden';

function figureStyle(role: Role, isMobile: boolean): CSSProperties {
  const shared: CSSProperties = {
    position: 'absolute', aspectRatio: '2 / 3',
    transition: `transform ${TRANSITION_MS}ms ${EASING}, filter ${TRANSITION_MS}ms ${EASING}, opacity ${TRANSITION_MS}ms ${EASING}, left ${TRANSITION_MS}ms ${EASING}, height ${TRANSITION_MS}ms ${EASING}, bottom ${TRANSITION_MS}ms ${EASING}`,
    willChange: 'transform, filter, opacity',
    transform: 'translateX(-50%) scale(1)',
  };
  if (role === 'center') return { ...shared, filter: 'blur(0px)', opacity: 1, zIndex: 20, left: '50%', height: isMobile ? '124%' : '130%', bottom: isMobile ? '-37%' : '-35%' };
  if (role === 'back') return { ...shared, filter: 'blur(3px)', opacity: 0.8, zIndex: 5, left: isMobile ? '78%' : '77%', height: isMobile ? '17%' : '25%', bottom: isMobile ? '64%' : '57%' };
  if (role === 'hidden') return { ...shared, filter: 'blur(4px)', opacity: 0, zIndex: 0, left: '50%', height: isMobile ? '13%' : '20%', bottom: isMobile ? '40%' : '20%' };
  return { ...shared, filter: 'blur(1.5px)', opacity: 0.9, zIndex: 10, left: role === 'left' ? (isMobile ? '13%' : '20%') : (isMobile ? '87%' : '82%'), height: isMobile ? '23%' : '36%', bottom: isMobile ? '35%' : role === 'left' ? '34%' : '14%' };
}

export default function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [hasOpenedGame, setHasOpenedGame] = useState(false);
  const [loadedSheets, setLoadedSheets] = useState<Set<string>>(() => new Set());
  const [loadedPortraits, setLoadedPortraits] = useState<Set<number>>(() => new Set());
  const portraitRequests = useRef(new Set<number>());
  const sheetRequests = useRef(new Set<string>());
  const mounted = useRef(false);
  const animationTimer = useRef<number | null>(null);
  const animationLock = useRef(false);
  const gameDialog = useRef<HTMLDialogElement>(null);
  const gameFrame = useRef<HTMLIFrameElement>(null);
  const activeCharacter = CHARACTERS[activeIndex];

  useEffect(() => {
    mounted.current = true;
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => {
      mounted.current = false;
      window.removeEventListener('resize', onResize);
      if (animationTimer.current !== null) window.clearTimeout(animationTimer.current);
    };
  }, []);

  useEffect(() => {
    [0, -1, 1, 2, 3].forEach(offset => {
      const character = CHARACTERS[(activeIndex + offset + CHARACTERS.length) % CHARACTERS.length];
      if (portraitRequests.current.has(character.id)) return;
      portraitRequests.current.add(character.id);
      const image = new Image();
      image.decoding = 'async';
      image.fetchPriority = offset === 0 ? 'high' : 'low';
      image.onload = () => {
        if (mounted.current) setLoadedPortraits(previous => new Set(previous).add(character.id));
      };
      image.onerror = () => {
        if (sheetRequests.current.has(character.sheet)) return;
        sheetRequests.current.add(character.sheet);
        const fallback = new Image();
        fallback.fetchPriority = 'low';
        fallback.onload = () => {
          if (mounted.current) setLoadedSheets(previous => new Set(previous).add(character.sheet));
        };
        fallback.src = `${import.meta.env.BASE_URL}characters/${character.sheet}`;
      };
      image.src = portraitUrl(character.id);
    });
  }, [activeIndex]);

  function sendTheme(character: Character) {
    const { id: cardId, bg, panel, ink, accent, pattern } = character;
    gameFrame.current?.contentWindow?.postMessage({ type: 'island-theme', cardId, bg, panel, ink, accent, pattern }, window.location.origin);
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== gameFrame.current?.contentWindow) return;
      if (event.data?.type === 'island-theme-ready') sendTheme(activeCharacter);
    };
    window.addEventListener('message', onMessage);
    sendTheme(activeCharacter);
    return () => window.removeEventListener('message', onMessage);
  }, [activeCharacter]);

  function navigate(direction: 'next' | 'prev') {
    if (isAnimating || animationLock.current) return;
    animationLock.current = true;
    setIsAnimating(true);
    setActiveIndex(previous => (previous + (direction === 'next' ? 1 : CHARACTERS.length - 1)) % CHARACTERS.length);
    animationTimer.current = window.setTimeout(() => {
      animationLock.current = false;
      setIsAnimating(false);
      animationTimer.current = null;
    }, TRANSITION_MS);
  }

  function openGame() {
    setHasOpenedGame(true);
    gameDialog.current?.showModal();
    sendTheme(activeCharacter);
  }

  function getRole(index: number): Role {
    if (index === activeIndex) return 'center';
    if (index === (activeIndex + CHARACTERS.length - 1) % CHARACTERS.length) return 'left';
    if (index === (activeIndex + 1) % CHARACTERS.length) return 'right';
    if (index === (activeIndex + 2) % CHARACTERS.length) return 'back';
    return 'hidden';
  }

  const themeStyle = {
    backgroundColor: activeCharacter.bg,
    transition: `background-color ${TRANSITION_MS}ms ${EASING}`,
    '--theme-bg': activeCharacter.bg,
    '--theme-panel': activeCharacter.panel,
    '--theme-ink': activeCharacter.ink,
    '--theme-accent': activeCharacter.accent,
    '--pattern-image': patternImage(activeCharacter.pattern, activeCharacter.accent),
  } as CSSProperties;

  return (
    <div className="island-site relative w-full overflow-clip" style={themeStyle} data-pattern={activeCharacter.pattern}>
      <main className="hero relative w-full overflow-clip" aria-label="臺灣地域角色輪播">
        <div className="hero-pattern absolute inset-0 pointer-events-none" aria-hidden="true" />
        <div className="grain absolute inset-0 pointer-events-none" aria-hidden="true" />
        <h1 className={`ghost-text absolute inset-x-0 flex items-center justify-center pointer-events-none select-none ${activeCharacter.region.length > 2 ? 'long-region' : ''}`}>{activeCharacter.region}</h1>

        <header className="site-header">
          <div className="brand-label"><span className="brand-mark" aria-hidden="true">嶼</span><span className="brand-name">{BRAND_NAME}<small>24位臺灣地域角色，選12張組牌。<br />點卡出場，全隊進攻。</small></span></div>
          <button className="play-trigger" type="button" onClick={openGame}>開始卡牌對戰 <ArrowUpRight size={16} strokeWidth={1.8} aria-hidden="true" /></button>
        </header>

        <div className="carousel absolute inset-0" aria-roledescription="角色輪播" aria-label="二十四位臺灣地域角色，同框四位">
          {CHARACTERS.map((character, index) => {
            const role = getRole(index);
            return (
              <div key={character.id} className={`carousel-figure role-${role}`} style={figureStyle(role, isMobile)} data-role={role} data-card-id={character.id} aria-hidden={role !== 'center'}>
                {loadedPortraits.has(character.id) ? (
                  <img className="character-portrait" src={portraitUrl(character.id)} alt={`${character.region}・${character.job}`} draggable={false} decoding="async" fetchPriority={role === 'center' ? 'high' : 'low'} />
                ) : (
                  <div className="character-sprite" role="img" aria-label={`${character.region}・${character.job}`} style={{ backgroundImage: loadedSheets.has(character.sheet) ? `url("${import.meta.env.BASE_URL}characters/${character.sheet}")` : undefined, backgroundPosition: `${character.spriteX}% ${character.spriteY}%` }}>
                    {!loadedSheets.has(character.sheet) && <div className="sprite-placeholder"><span>{character.region}</span><small>角色插圖載入中</small></div>}
                  </div>
                )}
                {role !== 'center' && role !== 'hidden' && <span className="companion-name">{character.region}</span>}
              </div>
            );
          })}
        </div>

        <section className="hero-description" aria-label="當前角色介紹">
          <p className="character-kicker"><span>{activeCharacter.region}・{activeCharacter.zone}生活圈</span><span className="kicker-line" /><span>{String(activeCharacter.id).padStart(2, '0')} <span className="count-slash">／</span> 24</span></p>
          <h2 className="character-job">{activeCharacter.job}</h2>
          <p className="character-quote">「{activeCharacter.quote}」</p>
          <div className="carousel-controls" aria-label="切換地域角色">
            <button className="carousel-arrow" type="button" onClick={() => navigate('prev')} disabled={isAnimating} aria-label="上一位角色"><ArrowLeft size={24} strokeWidth={1.8} aria-hidden="true" /></button>
            <button className="carousel-arrow" type="button" onClick={() => navigate('next')} disabled={isAnimating} aria-label="下一位角色"><ArrowRight size={24} strokeWidth={1.8} aria-hidden="true" /></button>
            <span className="carousel-hint">轉一圈，遇見全臺灣。</span>
          </div>
        </section>

        <a className="discover-link" href="#play" onClick={event => { event.preventDefault(); openGame(); }} aria-label="開始對決，開啟臺灣地域卡牌遊戲"><span><small>把你的日常，打成主場。</small>開始對決</span><ArrowUpRight className="discover-arrow" strokeWidth={1.8} aria-hidden="true" /></a>
        <span className="sr-only" role="status" aria-live="polite">第 {activeIndex + 1} 位，共 24 位。{activeCharacter.region}，{activeCharacter.job}。{activeCharacter.quote}</span>
      </main>

      <dialog ref={gameDialog} className="game-dialog" aria-labelledby="game-title">
        <div className="game-shell">
          <header className="game-topbar"><div><h2 id="game-title">{BRAND_NAME}</h2><span>你的對局會保留，隨時回來繼續。</span></div><button className="return-home" type="button" onClick={() => gameDialog.current?.close()}><ArrowLeft size={16} aria-hidden="true" /> 返回首頁</button></header>
          {hasOpenedGame && <iframe ref={gameFrame} className="game-frame" src={`${import.meta.env.BASE_URL}game/index.html?v=20260925-battle-3`} title={`${BRAND_NAME} — 臺灣地域卡牌對戰`} onLoad={() => sendTheme(activeCharacter)} />}
        </div>
      </dialog>
    </div>
  );
}
