/**
 * Trails of Tukana Helper
 * Version: v1.3.0
 * Full Game Companion, Deck Tracker, & State Manager
 */

const APP_VERSION = 'v1.3.0';

// Звуковые эффекты
const clickAudio = new Audio('audio/click.mp3');
let soundEnabled = localStorage.getItem('tot_sound_enabled') !== 'false';

// Haptic feedback (вибрация на мобильных устройствах)
function triggerHaptic(duration = 25) {
    if ('vibrate' in navigator) {
        try {
            navigator.vibrate(duration);
        } catch (e) {
            // Игнорируем в средах без поддержки вибрации
        }
    }
}

// Воспроизведение звука клика с учётом настроек
function playSound() {
    if (!soundEnabled) return;
    try {
        clickAudio.currentTime = 0;
        clickAudio.play().catch(() => {});
    } catch (e) {}
}

// Переключение звука
function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('tot_sound_enabled', soundEnabled);
    updateSoundUI();
    playSound();
    triggerHaptic(15);
}

function updateSoundUI() {
    const icon = document.getElementById('sound-icon');
    if (icon) {
        icon.innerText = soundEnabled ? '🔊' : '🔇';
    }
}

// ----------------------------------------------------
// Screen Wake Lock API (Предотвращение гашения экрана)
// ----------------------------------------------------
let wakeLock = null;
let wakeLockEnabled = true;

async function requestWakeLock() {
    if ('wakeLock' in navigator && wakeLockEnabled) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                updateWakeLockUI(false);
            });
            updateWakeLockUI(true);
        } catch (err) {
            console.log('Wake Lock request error:', err);
            updateWakeLockUI(false);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
    updateWakeLockUI(false);
}

function toggleWakeLock() {
    wakeLockEnabled = !wakeLockEnabled;
    if (wakeLockEnabled) {
        requestWakeLock();
    } else {
        releaseWakeLock();
    }
    triggerHaptic(15);
}

function updateWakeLockUI(isActive) {
    const icon = document.getElementById('wakelock-icon');
    if (icon) {
        icon.innerText = isActive ? '🔆' : '🌙';
        icon.title = isActive ? 'Экран включён (Wake Lock активен)' : 'Экран может гаснуть';
    }
}

// Повторное включение WakeLock при возврате на вкладку
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLockEnabled && pageNumber === 4) {
        requestWakeLock();
    }
});

// ----------------------------------------------------
// Игровое состояние и константы
// ----------------------------------------------------
const MAPS_VILLAGES = [
    ['A', 'C', 'B', 'D', 'C', 'D', 'E', 'B', 'A', 'E'],
    ['B', 'E', 'D', 'C', 'B', 'A', 'D', 'E', 'C', 'A'],
    ['B', 'D', 'C', 'A', 'E', 'B', 'E', 'D', 'C', 'A'],
    ['E', 'B', 'D', 'B', 'A', 'C', 'A', 'E', 'C', 'D'],
    ['C', 'A', 'E', 'C', 'B', 'A', 'D', 'E', 'B', 'D'],
    ['A', 'D', 'C', 'B', 'D', 'A', 'C', 'E', 'B', 'E'],
    ['D', 'B', 'A', 'C', 'E', 'C', 'D', 'A', 'E', 'B'],
    ['E', 'C', 'E', 'A', 'B', 'D', 'A', 'B', 'D', 'C'],
    ['E', 'A', 'D', 'B', 'C', 'E', 'B', 'D', 'A', 'C'],
    ['C', 'E', 'B', 'A', 'E', 'D', 'C', 'D', 'A', 'B'],
    ['D', 'A', 'D', 'B', 'A', 'E', 'C', 'E', 'C', 'B'],
    ['D', 'C', 'E', 'A', 'D', 'C', 'B', 'A', 'E', 'B'],
    ['B', 'A', 'C', 'B', 'D', 'C', 'E', 'A', 'E', 'D']
];

// Исходная колода местности (27 карт: 4 воды, 7 леса, 6 гор, 8 пустыни, 2 джокера)
const BASE_DECK = [
    'water', 'water', 'water', 'water',
    'forest', 'forest', 'forest', 'forest', 'forest', 'forest', 'forest',
    'mountan', 'mountan', 'mountan', 'mountan', 'mountan', 'mountan',
    'desert', 'desert', 'desert', 'desert', 'desert', 'desert', 'desert', 'desert',
    'joker', 'joker'
];

const TOTAL_TERRAIN_COUNTS = {
    desert: 8,
    forest: 7,
    mountan: 6,
    water: 4,
    joker: 2
};

const ALL_SIGHTS = ['cat', 'book', 'dragon', 'monument', 'bird'];

// Переменные партии
let pageNumber = 1;
let mapSetting = 0; // 0: Small Map (2 раунда), 1: Big Map (3 раунда)
let mapN = 0;       // Индекс текущей раскладки деревень
let setUp = 0;      // 0: 2-4 игрока, 1: 5-8 игроков
let roundN = 0;     // Текущий раунд (1, 2, 3)
let openCardNumber = 0; // Количество открытых карт в текущем раунде (0..26)
let deck = [...BASE_DECK];
let startBonus = [...ALL_SIGHTS];
let sightMarked = [false, false]; // Отмечены ли бонусные достопримечательности
let baseBonusesChecked = [false, false, false, false, false]; // A..E base
let dopBonusesChecked = [false, false, false, false, false];  // A..E dop
let mapsList = JSON.parse(JSON.stringify(MAPS_VILLAGES));

// Ключ автосохранения в LocalStorage
const STORAGE_KEY = 'tot_helper_game_state_v2';

// ----------------------------------------------------
// Навигация по страницам
// ----------------------------------------------------
function goToPage(targetPage) {
    pageNumber = targetPage;
    document.querySelectorAll('.page').forEach((page, idx) => {
        if (idx + 1 === targetPage) {
            page.classList.add('active');
        } else {
            page.classList.remove('active');
        }
    });

    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
        if (pageNumber === 4) {
            headerTitle.innerText = `ROUND ${roundN}`;
            requestWakeLock();
        } else if (pageNumber === 3) {
            headerTitle.innerText = 'VILLAGE SETUP';
        } else if (pageNumber === 2) {
            headerTitle.innerText = 'SELECT MAP';
        } else {
            headerTitle.innerText = 'TRAILS OF TUKANA';
        }
    }

    saveGameState();
}

function startNewGameFlow() {
    playSound();
    triggerHaptic(20);
    resetGameState();
    // При открытии страницы с выбором карты заново перемешиваем раскладки деревень
    mapsList = shuffleArray(JSON.parse(JSON.stringify(MAPS_VILLAGES)));
    mapN = getSecureRandomInt(mapsList.length);
    renderVillages(mapN);
    goToPage(2);
}

function selectMap(size) {
    playSound();
    triggerHaptic(20);
    mapSetting = size;
    // При выборе карты гарантируем новую случайную раскладку деревень
    mapsList = shuffleArray(JSON.parse(JSON.stringify(MAPS_VILLAGES)));
    mapN = getSecureRandomInt(mapsList.length);
    renderVillages(mapN);
    goToPage(3);
}

// Переключение раскладки деревень
function MapDraw() {
    playSound();
    triggerHaptic(15);
    mapN++;
    if (mapN >= mapsList.length) {
        mapsList = shuffleArray(JSON.parse(JSON.stringify(MAPS_VILLAGES)));
        mapN = 0;
    }
    renderVillages(mapN);
    saveGameState();
}

function renderVillages(idx) {
    const letters = mapsList[idx] || mapsList[0];
    letters.forEach((val, i) => {
        const el = document.querySelector(`.txtImgMAP.n${i + 1}`);
        if (el) el.textContent = val;
    });
}

// Переключение 2-4 / 5-8 игроков
function toggleSetUp() {
    playSound();
    triggerHaptic(15);
    setUp = setUp === 0 ? 1 : 0;
    updateSetUpUI();
    saveGameState();
}

function updateSetUpUI() {
    const btn = document.getElementById('setup-btn');
    if (btn) {
        btn.innerText = setUp === 0 ? '2-4 PLAYERS' : '5-8 PLAYERS';
    }
}

// Старт первого раунда
function Round1() {
    playSound();
    triggerHaptic(25);
    roundN = 1;
    openCardNumber = 0;
    deck = shuffleArray([...BASE_DECK]);
    startBonus = shuffleArray([...ALL_SIGHTS]);
    sightMarked = [false, false];
    baseBonusesChecked = [false, false, false, false, false];
    dopBonusesChecked = [false, false, false, false, false];

    goToPage(4);
    applyRoundSetupUI();
    renderCardsState(false);
    updateCardTracker();
    saveGameState();
}

// Применение настроек раунда и бонусов
function applyRoundSetupUI() {
    const roundBadge = document.querySelector('.round-number');
    if (roundBadge) roundBadge.innerText = `ROUND ${roundN}`;

    const headerTitle = document.getElementById('header-title');
    if (headerTitle) headerTitle.innerText = `ROUND ${roundN}`;

    const sight1 = document.getElementById('sight-bonus-1');
    const sight2 = document.getElementById('sight-bonus-2');

    if (sight1) {
        const name1 = sightMarked[0] ? `${startBonus[0]}x` : startBonus[0];
        sight1.src = `img/${name1}.png`;
    }
    if (sight2) {
        if (setUp === 0) {
            // Для 2-4 игроков используется только 1 бонусная достопримечательность
            sight2.style.display = 'none';
        } else {
            sight2.style.display = 'block';
            const name2 = sightMarked[1] ? `${startBonus[1]}x` : startBonus[1];
            sight2.src = `img/${name2}.png`;
        }
    }

    // Дополнительные бонусы деревень для 5-8 игроков
    for (let i = 1; i <= 5; i++) {
        const dopBonus = document.getElementById(`bonus-dop-${i}`);
        if (dopBonus) {
            if (setUp === 0) {
                dopBonus.style.display = 'none';
            } else {
                dopBonus.style.display = 'flex';
                if (baseBonusesChecked[i - 1]) {
                    dopBonus.classList.add('visible');
                } else {
                    dopBonus.classList.remove('visible');
                }
            }
        }

        const chkBase = document.getElementById(`chk-base-${i}`);
        if (chkBase) {
            chkBase.style.display = baseBonusesChecked[i - 1] ? 'block' : 'none';
        }

        const chkDop = document.getElementById(`chk-dop-${i}`);
        if (chkDop) {
            chkDop.style.display = dopBonusesChecked[i - 1] ? 'block' : 'none';
        }
    }
}

// ----------------------------------------------------
// Открытие карт и игровой процесс (Next & Undo)
// ----------------------------------------------------
function Next() {
    playSound();
    triggerHaptic(30);

    // Если 26 карт уже открыты (в колоде осталась 1 карта) и игрок снова нажимает "Далее",
    // только теперь открываем окно о переходе на следующий раунд / финише
    if (openCardNumber >= 26) {
        openPopup('next');
        return;
    }

    // Обычный ход (включая последний ход, когда открываются 25-я и 26-я карты)
    openCardNumber += 2;
    renderCardsState(true);
    updateCardTracker();
    saveGameState();
}

// Кнопка «Отмена» (Undo)
function undoDraw() {
    if (openCardNumber < 2) return;

    playSound();
    triggerHaptic(25);

    openCardNumber -= 2;
    renderCardsState(false);
    updateCardTracker();
    saveGameState();

    // Если было открыто модальное окно завершения раунда, скрываем его
    closePopup();
}

// Обновление отображения карт на столе
function renderCardsState(animateDeal = false) {
    const openCard1 = document.getElementById('open-card-1');
    const openCard2 = document.getElementById('open-card-2');
    const openCardsWrap = document.getElementById('open-cards');
    const lastCardWrap1 = document.getElementById('last-cards-wrap');
    const lastCardWrap2 = document.getElementById('last-cards-wrap-2');
    const lastCard1 = document.getElementById('last-card-1');
    const lastCard2 = document.getElementById('last-card-2');
    const countCards = document.getElementById('countCards');
    const btnUndo = document.getElementById('btn-undo');

    // Кнопка Undo активна, если хотя бы 2 карты открыты
    if (btnUndo) {
        btnUndo.disabled = openCardNumber < 2;
    }

    // Оставшееся количество карт в колоде
    const remaining = 27 - openCardNumber;
    if (countCards) {
        countCards.innerText = remaining;
    }
    updateDeckColor(openCardNumber);

    if (openCardNumber === 0) {
        // Начало раунда - карт на столе нет
        if (openCardsWrap) openCardsWrap.style.visibility = 'hidden';
        if (lastCardWrap1) lastCardWrap1.style.display = 'none';
        if (lastCardWrap2) lastCardWrap2.style.display = 'none';
    } else {
        // Отображение текущей пары карт
        if (openCardsWrap) openCardsWrap.style.visibility = 'visible';
        if (openCard1) openCard1.src = `img/${deck[openCardNumber - 2]}.png`;
        if (openCard2) openCard2.src = `img/${deck[openCardNumber - 1]}.png`;

        if (animateDeal) {
            const wrap1 = document.getElementById('open-card-wrap-1');
            const wrap2 = document.getElementById('open-card-wrap-2');
            if (wrap1) {
                wrap1.classList.remove('card-deal-anim');
                void wrap1.offsetWidth; // Force reflow
                wrap1.classList.add('card-deal-anim');
            }
            if (wrap2) {
                wrap2.classList.remove('card-deal-anim');
                void wrap2.offsetWidth; // Force reflow
                wrap2.classList.add('card-deal-anim');
            }
        }

        // Отображение предыдущей пары карт (Last Cards)
        if (openCardNumber >= 4) {
            if (lastCardWrap1) lastCardWrap1.style.display = 'flex';
            if (lastCardWrap2) lastCardWrap2.style.display = 'flex';
            if (lastCard1) lastCard1.src = `img/${deck[openCardNumber - 4]}.png`;
            if (lastCard2) lastCard2.src = `img/${deck[openCardNumber - 3]}.png`;
        } else {
            if (lastCardWrap1) lastCardWrap1.style.display = 'none';
            if (lastCardWrap2) lastCardWrap2.style.display = 'none';
        }
    }
}

// Плавный градиент колоды от голубого к красному по мере опустошения
function updateDeckColor(cardsDrawn) {
    const countDeckEl = document.querySelector('.count-deck');
    if (!countDeckEl) return;

    const max = 26;
    const ratio = Math.min(cardsDrawn / max, 1);
    const r = Math.round(112 + ratio * (240 - 112));
    const g = Math.round(174 - ratio * 120);
    const b = Math.round(196 - ratio * 140);
    countDeckEl.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
}

// ----------------------------------------------------
// Бонусы достопримечательностей и деревень
// ----------------------------------------------------
function toggleSightBonus(imgElement) {
    playSound();
    triggerHaptic(15);
    const isFirst = imgElement.id === 'sight-bonus-1';
    const idx = isFirst ? 0 : 1;
    sightMarked[idx] = !sightMarked[idx];

    const baseName = startBonus[idx];
    imgElement.src = sightMarked[idx] ? `img/${baseName}x.png` : `img/${baseName}.png`;
    saveGameState();
}

function handleBonusClick(index, isDop) {
    playSound();
    triggerHaptic(15);

    const arrayIdx = index - 1;
    if (!isDop) {
        // Нажатие на базовый бонус
        baseBonusesChecked[arrayIdx] = !baseBonusesChecked[arrayIdx];
        const chk = document.getElementById(`chk-base-${index}`);
        if (chk) chk.style.display = baseBonusesChecked[arrayIdx] ? 'block' : 'none';

        const dopEl = document.getElementById(`bonus-dop-${index}`);
        if (dopEl && setUp === 1) {
            if (baseBonusesChecked[arrayIdx]) {
                dopEl.classList.add('visible');
            } else {
                dopEl.classList.remove('visible');
                // Сбрасываем dop галочку если базовый снят
                dopBonusesChecked[arrayIdx] = false;
                const chkDop = document.getElementById(`chk-dop-${index}`);
                if (chkDop) chkDop.style.display = 'none';
            }
        }
    } else {
        // Нажатие на дополнительный бонус (только для 5-8 игроков)
        if (setUp === 1 && baseBonusesChecked[arrayIdx]) {
            dopBonusesChecked[arrayIdx] = !dopBonusesChecked[arrayIdx];
            const chkDop = document.getElementById(`chk-dop-${index}`);
            if (chkDop) chkDop.style.display = dopBonusesChecked[arrayIdx] ? 'block' : 'none';
        }
    }
    saveGameState();
}

// ----------------------------------------------------
// Счётчик оставшихся карт (Card Tracker)
// ----------------------------------------------------
function updateCardTracker() {
    const remainingCards = deck.slice(openCardNumber);
    const counts = {
        desert: 0,
        forest: 0,
        mountan: 0,
        water: 0,
        joker: 0
    };

    remainingCards.forEach(type => {
        if (counts[type] !== undefined) {
            counts[type]++;
        }
    });

    const totalRemaining = remainingCards.length;
    const headerRemaining = document.getElementById('tracker-deck-remaining');
    if (headerRemaining) {
        headerRemaining.innerText = `${totalRemaining} / 27 cards left`;
    }

    Object.keys(TOTAL_TERRAIN_COUNTS).forEach(type => {
        const total = TOTAL_TERRAIN_COUNTS[type];
        const current = counts[type];
        const countEl = document.getElementById(`count-${type}`);
        const barEl = document.getElementById(`bar-${type}`);
        const rowEl = document.getElementById(`tr-${type}`);

        if (countEl) countEl.innerText = `${current} / ${total}`;
        if (barEl) {
            const pct = Math.round((current / total) * 100);
            barEl.style.width = `${pct}%`;
            barEl.style.backgroundColor = current === 0 ? '#ff595e' : '#4cc9f0';
        }
        if (rowEl) {
            if (current === 0) {
                rowEl.classList.add('empty');
            } else {
                rowEl.classList.remove('empty');
            }
        }
    });
}

function toggleTrackerModal() {
    playSound();
    triggerHaptic(15);
    const modal = document.getElementById('tracker-modal');
    if (!modal) return;
    if (modal.classList.contains('active')) {
        modal.classList.remove('active');
    } else {
        updateCardTracker();
        modal.classList.add('active');
    }
}

function closeTrackerIfBackdrop(event) {
    if (event.target.id === 'tracker-modal') {
        toggleTrackerModal();
    }
}

// ----------------------------------------------------
// Модальные диалоги и переходы раундов
// ----------------------------------------------------
let currentPopupType = null;

function openPopup(type) {
    playSound();
    currentPopupType = type;
    const overlay = document.getElementById('overlay');
    const text1 = document.getElementById('first');
    const text2 = document.getElementById('second');
    const desc = document.getElementById('popup-desc');
    const btn1 = document.getElementById('button1');
    const btn2 = document.getElementById('button2');

    btn1.className = 'button action-button 1';
    btn2.style.display = 'block';
    if (desc) desc.style.display = 'none';

    if (type === 'next') {
        const maxRounds = mapSetting + 2; // 2 для маленькой, 3 для большой
        if (roundN >= maxRounds) {
            text1.innerText = 'GAME';
            text2.innerText = 'FINISHED!';
            if (desc) {
                desc.innerText = 'All rounds complete! Calculate final scores on your player sheets.';
                desc.style.display = 'block';
            }
            btn1.innerText = 'NEW GAME';
            btn2.innerText = 'BACK TO BOARD';
        } else {
            text1.innerText = 'ROUND COMPLETE';
            text2.innerText = `NEXT: ROUND ${roundN + 1}`;
            btn1.innerText = `START ROUND ${roundN + 1}`;
            btn2.innerText = 'STAY HERE';
        }
    } else if (type === 'menu') {
        text1.innerText = pageNumber > 1 ? 'NEW GAME?' : 'GAME MENU';
        text2.innerText = `VERSION ${APP_VERSION}`;
        if (desc) {
            desc.innerHTML = `Trails of Tukana Helper • ${APP_VERSION}<br><button class="btn-clean-update" onclick="forceUpdateApp()">🔄 Очистить кэш и перекачать</button>`;
            desc.style.display = 'block';
        }
        btn1.innerText = pageNumber > 1 ? 'START OVER' : 'CLOSE';
        if (pageNumber > 1) {
            btn1.classList.add('action-btn-danger');
        } else {
            btn1.className = 'button action-button 1';
        }
        btn2.innerText = 'CANCEL';
    }

    if (overlay) overlay.classList.add('active');
}

function closePopup() {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.remove('active');
    currentPopupType = null;
}

function openMenuPopup() {
    openPopup('menu');
}

function performAction(buttonId) {
    playSound();
    triggerHaptic(20);

    if (currentPopupType === 'next') {
        if (buttonId === 1) {
            const maxRounds = mapSetting + 2;
            if (roundN >= maxRounds) {
                resetGameState();
                goToPage(1);
            } else {
                startNextRound();
            }
        }
    } else if (currentPopupType === 'menu') {
        if (buttonId === 1) {
            if (pageNumber > 1) {
                resetGameState();
                goToPage(1);
            }
        }
    }
    closePopup();
}

function startNextRound() {
    roundN++;
    openCardNumber = 0;
    deck = shuffleArray([...BASE_DECK]);
    goToPage(4);
    applyRoundSetupUI();
    renderCardsState(false);
    updateCardTracker();
    saveGameState();
}

// ----------------------------------------------------
// Сохранение и восстановление состояния (LocalStorage)
// ----------------------------------------------------
function saveGameState() {
    const state = {
        pageNumber,
        mapSetting,
        mapN,
        setUp,
        roundN,
        openCardNumber,
        deck,
        startBonus,
        sightMarked,
        baseBonusesChecked,
        dopBonusesChecked,
        mapsList
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
}

function checkSavedGame() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const state = JSON.parse(raw);
        if (state && state.roundN > 0 && state.pageNumber >= 3) {
            const btnContinue = document.getElementById('btn-continue');
            if (btnContinue) {
                btnContinue.style.display = 'flex';
                btnContinue.innerText = `CONTINUE ROUND ${state.roundN}`;
            }
            return true;
        }
    } catch (e) {}
    return false;
}

function resumeGame() {
    playSound();
    triggerHaptic(20);
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const state = JSON.parse(raw);

        pageNumber = state.pageNumber || 4;
        mapSetting = state.mapSetting || 0;
        mapN = state.mapN || 0;
        setUp = state.setUp || 0;
        roundN = state.roundN || 1;
        openCardNumber = state.openCardNumber || 0;
        deck = state.deck || [...BASE_DECK];
        startBonus = state.startBonus || [...ALL_SIGHTS];
        sightMarked = state.sightMarked || [false, false];
        baseBonusesChecked = state.baseBonusesChecked || [false, false, false, false, false];
        dopBonusesChecked = state.dopBonusesChecked || [false, false, false, false, false];
        if (state.mapsList) mapsList = state.mapsList;

        updateSetUpUI();
        renderVillages(mapN);
        goToPage(pageNumber);
        if (pageNumber === 4) {
            applyRoundSetupUI();
            renderCardsState(false);
            updateCardTracker();
        }
    } catch (e) {
        console.error('Error resuming game:', e);
        startNewGameFlow();
    }
}

function resetGameState() {
    pageNumber = 1;
    mapSetting = 0;
    setUp = 0;
    roundN = 0;
    openCardNumber = 0;
    deck = [...BASE_DECK];
    startBonus = [...ALL_SIGHTS];
    sightMarked = [false, false];
    baseBonusesChecked = [false, false, false, false, false];
    dopBonusesChecked = [false, false, false, false, false];
    mapsList = shuffleArray(JSON.parse(JSON.stringify(MAPS_VILLAGES)));
    mapN = getSecureRandomInt(mapsList.length);
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    const btnContinue = document.getElementById('btn-continue');
    if (btnContinue) btnContinue.style.display = 'none';
}

// ----------------------------------------------------
// Служебные функции (Криптографически стойкое перемешивание колоды)
// ----------------------------------------------------
/**
 * Криптографически стойкий генератор целых чисел в диапазоне [0, maxExclusive - 1]
 * Использует Web Crypto API с отбрасыванием остаточного смещения (unbiased rejection sampling).
 */
function getSecureRandomInt(maxExclusive) {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
        const array = new Uint32Array(1);
        const maxUint = 0xFFFFFFFF;
        const limit = maxUint - (maxUint % maxExclusive);
        let rand;
        do {
            window.crypto.getRandomValues(array);
            rand = array[0];
        } while (rand >= limit);
        return rand % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
}

/**
 * Идеальный алгоритм Фишера-Йетса (Кнут):
 * Гарантирует строго равномерное распределение вероятностей всех 27! перестановок.
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = getSecureRandomInt(i + 1);
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ----------------------------------------------------
// Автоматическое обновление приложения и PWA
// ----------------------------------------------------
function showUpdateToast() {
    let toast = document.getElementById('update-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'update-toast';
        toast.className = 'update-toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `
        <span>Доступна новая версия приложения!</span>
        <button class="toast-btn" onclick="applyAppUpdate()">Обновить</button>
    `;
    toast.style.display = 'flex';
}

function applyAppUpdate() {
    playSound();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
            if (reg && reg.waiting) {
                reg.waiting.postMessage({ action: 'skipWaiting' });
            } else {
                window.location.reload();
            }
        });
    } else {
        window.location.reload();
    }
}

async function forceUpdateApp() {
    playSound();
    triggerHaptic(30);
    closePopup();

    let toast = document.getElementById('update-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'update-toast';
        toast.className = 'update-toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>Очистка кэша и перекачивание...</span>`;
    toast.style.display = 'flex';

    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) {
                await r.unregister();
            }
        }
    } catch (e) {
        console.warn('Error clearing caches:', e);
    }

    setTimeout(() => {
        window.location.href = window.location.pathname + '?v=' + Date.now();
    }, 400);
}

// ----------------------------------------------------
// Инициализация при загрузке страницы
// ----------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
    updateSoundUI();
    checkSavedGame();

    // Синхронизируем плашку версии в интерфейсе
    const verEl = document.getElementById('app-version-badge');
    if (verEl) verEl.innerText = APP_VERSION;

    // Регистрация авто-обновляемого Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register(`service-worker.js?v=${APP_VERSION}`)
            .then((reg) => {
                console.log(`[App ${APP_VERSION}] Service Worker registered:`, reg.scope);

                // Запрашиваем проверку обновлений у сервера
                reg.update().catch(() => {});

                // Слушаем скачивание новой версии в фоне
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // Новая версия готова к применению!
                                showUpdateToast();
                            }
                        });
                    }
                });
            })
            .catch((err) => {
                console.warn('Service Worker registration skipped:', err);
            });

        // При смене контроллера (активации нового SW) плавно перезагружаем страницу
        let isRefreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!isRefreshing) {
                isRefreshing = true;
                window.location.reload();
            }
        });
    }

    // Скрытие прелоадера
    setTimeout(() => {
        const preloader = document.getElementById('preloader_malc');
        if (preloader) {
            preloader.style.opacity = '0';
            setTimeout(() => {
                preloader.style.display = 'none';
            }, 300);
        }
    }, 400);
});

// Проверка обновлений при возврате на вкладку
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
            if (reg) reg.update().catch(() => {});
        });
    }
});
