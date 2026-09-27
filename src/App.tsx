import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Grid2X2, X } from 'lucide-react';
import { CHARACTERS, type Character } from './characters';
import { patternImage } from './patterns';

const BRAND_NAME = 'Card & TW ＆ Game';
const TRANSITION_MS = 650;
const EASING = 'cubic-bezier(0.4,0,0.2,1)';
const portraitUrl = (id: number, size = 'hero') => `${import.meta.env.BASE_URL}characters/web/${size}-${String(id).padStart(2, '0')}.webp`;
type Role = 'center' | 'left' | 'right' | 'back' | 'hidden';

function figureStyle(role: Role, isMobile: boolean): CSSProperties {
  const height = 124;
  const baseBottom = isMobile ? -37 : -36;
  const placements = {
    center: [50, height, baseBottom, 20, 1, 0],
    left: [isMobile ? 13 : 20, isMobile ? 23 : 36, isMobile ? 35 : 34, 10, .9, 1.5],
    right: [isMobile ? 87 : 82, isMobile ? 23 : 36, isMobile ? 35 : 14, 10, .9, 1.5],
    back: [isMobile ? 78 : 77, isMobile ? 17 : 25, isMobile ? 64 : 57, 5, .8, 3],
    hidden: [50, 16, 30, 0, 0, 4],
  };
  const [left, figureHeight, bottom, zIndex, opacity, blur] = placements[role];
  return {
    position: 'absolute', aspectRatio: '2 / 3', left: '50%', height: `${height}%`, bottom: `${baseBottom}%`,
    transformOrigin: 'center bottom',
    transform: `translateX(-50%) translate3d(${left - 50}vw, ${-(bottom - baseBottom) / height * 100}%, 0) scale(${figureHeight / height})`,
    transition: `transform ${TRANSITION_MS}ms ${EASING}, opacity ${TRANSITION_MS}ms ${EASING}`,
    willChange: role === 'hidden' ? undefined : 'transform, opacity', filter: `blur(${blur}px)`, zIndex, opacity,
  };
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
  const collectionDialog = useRef<HTMLDialogElement>(null);
  const activeCharacter = CHARACTERS[activeIndex];

  useEffect(() => {
    mounted.current = true;
    if (window.location.hash === '#play') openGame();
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => {
      mounted.current = false;
      window.removeEventListener('resize', onResize);
      if (animationTimer.current !== null) window.clearTimeout(animationTimer.current);
    };
  }, []);

  useEffect(() => {
    [0, -1, 1, 2].forEach(offset => {
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

  function selectCharacter(index: number) {
    if (animationTimer.current !== null) window.clearTimeout(animationTimer.current);
    animationLock.current = false;
    setIsAnimating(false);
    setActiveIndex(index);
    collectionDialog.current?.close();
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
        <p className={`ghost-text absolute inset-x-0 flex items-center justify-center pointer-events-none select-none ${activeCharacter.region.length > 2 ? 'long-region' : ''}`} aria-hidden="true">{activeCharacter.region}</p>

        <header className="site-header">
          <div className="brand-label"><img className="brand-mark brand-logo" src={`${import.meta.env.BASE_URL}brand/logo.svg`} width={40} height={44} alt="" /><span className="brand-name">{BRAND_NAME}<small>臺灣地域自走棋</small></span></div>
          <button className="collection-trigger" type="button" onClick={() => collectionDialog.current?.showModal()}><Grid2X2 size={18} aria-hidden="true" />角色圖鑑</button>
        </header>

        <div className="game-pitch"><h1>招募英雄，排陣上場。</h1><p>24 位角色，10 輪單機自動對戰。</p></div>

        <div className="carousel absolute inset-0" aria-roledescription="角色輪播" aria-label="二十四位臺灣地域角色，同框四位">
          {CHARACTERS.map((character, index) => {
            const role = getRole(index);
            return (
              <div key={character.id} className={`carousel-figure role-${role}`} style={figureStyle(role, isMobile)} data-role={role} data-card-id={character.id} aria-hidden={role !== 'center'}>
                {loadedPortraits.has(character.id) ? (
                  <img className="character-portrait" src={portraitUrl(character.id)} width={1024} height={1536} alt={`${character.region}・${character.job}`} draggable={false} decoding="async" fetchPriority={role === 'center' ? 'high' : 'low'} />
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

        <a className="discover-link" href="#play" onClick={event => { event.preventDefault(); openGame(); }} aria-label="開始冒險，開啟單機自走棋"><span><small>免下載・免登入</small>開始冒險</span><ArrowUpRight className="discover-arrow" strokeWidth={1.8} aria-hidden="true" /></a>
        <span className="sr-only" role="status" aria-live="polite">第 {activeIndex + 1} 位，共 24 位。{activeCharacter.region}，{activeCharacter.job}。{activeCharacter.quote}</span>
      </main>

      <section className="site-reading" aria-labelledby="reading-title">
        <div className="site-reading-copy"><p className="reading-kicker">{BRAND_NAME} · 臺灣地域自走棋</p><h2 id="reading-title">24 位臺灣角色，一場輕鬆上手的自走棋。</h2><p>免費、免註冊的單機網頁遊戲。招募角色、組合六種羈絆，讓隊伍自動對戰，挑戰十輪冒險。</p></div>
        <nav className="reading-links" aria-label="遊戲資料">
          <a href={`${import.meta.env.BASE_URL}guide/`}><span><strong>玩法教學</strong><small>招募、排陣與三合一</small></span><ArrowUpRight size={22} aria-hidden="true" /></a>
          <a href={`${import.meta.env.BASE_URL}characters/`}><span><strong>24 角色圖鑑</strong><small>地區台詞、技能與羈絆</small></span><ArrowUpRight size={22} aria-hidden="true" /></a>
          <a href={`${import.meta.env.BASE_URL}about/`}><span><strong>關於與隱私</strong><small>創作來源與本機存檔</small></span><ArrowUpRight size={22} aria-hidden="true" /></a>
        </nav>
        <p className="reading-note">地區角色是趣味創作，不代表真實居民。遊戲進度儲存於目前裝置的瀏覽器。</p>
      </section>

      <dialog ref={collectionDialog} className="collection-dialog" aria-labelledby="collection-title">
        <header className="collection-header"><div><h2 id="collection-title">找找你的主場</h2><p>24 個地區，24 種上場的個性。</p></div><button className="icon-button" type="button" onClick={() => collectionDialog.current?.close()} aria-label="關閉角色圖鑑"><X size={22} aria-hidden="true" /></button></header>
        <div className="collection-grid">{CHARACTERS.map((character, index) => (
          <button key={character.id} className="collection-card" type="button" onClick={() => selectCharacter(index)} aria-label={`查看${character.region}・${character.job}`} aria-pressed={index === activeIndex} style={{ '--character-bg': character.bg } as CSSProperties}>
            <img src={portraitUrl(character.id, 'card')} width={320} height={480} alt="" loading="lazy" decoding="async" />
            <span><strong>{character.region}</strong><small>{character.job}</small></span>
          </button>
        ))}</div>
      </dialog>

      <dialog ref={gameDialog} className="game-dialog" aria-labelledby="game-title">
        <div className="game-shell">
          <header className="game-topbar"><div><h2 id="game-title">{BRAND_NAME}</h2><span>招募 → 排陣 → 自動對戰</span></div><button className="return-home" type="button" onClick={() => gameDialog.current?.close()}><ArrowLeft size={16} aria-hidden="true" /> 返回首頁</button></header>
          {hasOpenedGame && <iframe ref={gameFrame} className="game-frame" src={`${import.meta.env.BASE_URL}${import.meta.env.VITE_GAME_ENTRY}`} title={`${BRAND_NAME}｜臺灣地域自走棋`} onLoad={() => sendTheme(activeCharacter)} />}
        </div>
      </dialog>
    </div>
  );
}
