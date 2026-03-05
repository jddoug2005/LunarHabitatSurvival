let state = {
    day: 1, hp: 10, maxHp: 10, oxy: 20, wat: 20, foo: 20,
    bat: 0, scr: 0, ele: 0, ap: 0, res: 0,
    job: '', traits: [], loc: 'Base', weather: 'CLEAR',
    px: 2, py: 2, 
    sys: { solar: 0, condenser: 0, garden: 0, comms: 0, medbay: 0, turret: 0 },
    gardenProgress: 0, podDismantled: false,
    combat: { active: false, enemyHp: 0, type: '' },
    hack: { active: false, targetKeys: [], found: 0, tries: 3 }
};

const LOCATIONS = {
    'Base': { name: 'HABITAT ALPHA', color: '#00f0ff' },
    'Sat': { name: 'CRASHED SATELLITE', color: '#ffb700' },
    'Crater': { name: 'FROZEN CRATER', color: '#00ccff' },
    'Pod': { name: 'SUPPLY DROP POD', color: '#00ff66' }
};

const GRID_LAYOUT = {
    '2,2': { id: 'hub', name: 'MAIN HUB', col: '#00f0ff' },
    '2,1': { id: 'solar', name: 'SOLAR ARRAY', col: '#ffb700', req: 'solar' },
    '1,2': { id: 'condenser', name: 'CONDENSER', col: '#0088ff', req: 'condenser' },
    '3,2': { id: 'garden', name: 'HYDRO-GARDEN', col: '#00ff66', req: 'garden' },
    '2,3': { id: 'medbay', name: 'MEDBAY', col: '#ff2a2a', req: 'medbay' },
    '1,1': { id: 'comms', name: 'COMMS ARRAY', col: '#ff66ff', req: 'comms' },
    '3,1': { id: 'turret', name: 'DEFENSE TURRET', col: '#ff2a2a', req: 'turret' }
};

const LORE_DATALOGS = [
    "LOG 042: The seismic readings weren't anomalies. Something is active beneath the crust.",
    "LOG 089: Rizzo took the rover. Said he heard a distress beacon from Sector 4. He never came back.",
    "LOG 112: The automated defense drones severed our comm link to Earth. They are isolating us.",
    "LOG 015: Command says the extraction ship is 90 days out. I don't think we have enough water.",
    "LOG 077: I heard tapping on the outside of the airlock. We are supposed to be the only ones out here.",
    "LOG 099: The Atmospheric Condenser keeps pulling in trace amounts of... something biological.",
    "LOG 002: Habitat Alpha established. A new frontier for humanity. We are making history."
];

let inputLocked = false;

const sfx = {
    ctx: null, initialized: false, droneOsc: null,
    init() {
        if(this.initialized) return;
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.initialized = true;
        this.startDrone();
    },
    play(type) {
        if(!this.initialized) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.ctx.destination);
        const now = this.ctx.currentTime;
        
        if (type === 'click') {
            osc.type = 'square'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
            gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(now); osc.stop(now + 0.05);
        } else if (type === 'error') {
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(100, now + 0.3);
            gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'success') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(400, now); osc.frequency.setValueAtTime(600, now + 0.1);
            gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
            osc.start(now); osc.stop(now + 0.4);
        } else if (type === 'scan') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(200, now); osc.frequency.linearRampToValueAtTime(800, now + 0.8);
            gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.8);
            osc.start(now); osc.stop(now + 0.8);
        } else if (type === 'combat') {
            osc.type = 'square'; osc.frequency.setValueAtTime(100, now); osc.frequency.setValueAtTime(50, now+0.1);
            gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'aura') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); osc.frequency.linearRampToValueAtTime(900, now + 0.2);
            gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        }
    },
    startDrone() {
        this.droneOsc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        this.droneOsc.type = 'sine';
        this.droneOsc.frequency.value = 55;
        gain.gain.value = 0.05;
        this.droneOsc.connect(gain); gain.connect(this.ctx.destination);
        this.droneOsc.start();
    },
    setDroneFreq(f) { if(this.droneOsc) this.droneOsc.frequency.linearRampToValueAtTime(f, this.ctx.currentTime + 1); }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function setScreen(id) {
    ['screen-setup', 'screen-intro', 'screen-shutdown', 'screen-metabolism', 'screen-hud'].forEach(s => {
        const el = document.getElementById(s);
        if(el) { el.classList.add('hidden'); }
    });
    const target = document.getElementById(id);
    if(target) { target.classList.remove('hidden'); }
}

async function logMsg(text, color = 'var(--text)', isAura = false) {
    const log = document.getElementById('log-container');
    const entry = document.createElement('div');
    entry.style.marginBottom = '5px';
    entry.style.paddingLeft = '5px';
    entry.style.borderLeft = `2px solid ${color}`;
    entry.style.color = color;
    if(isAura) {
        entry.style.fontWeight = 'bold';
        entry.style.textShadow = '0 0 5px rgba(255,102,255,0.5)';
    }
    log.appendChild(entry);
    
    let prefix = isAura ? '[AURA]: ' : '> ';
    let currentText = prefix;
    entry.textContent = currentText;
    
    if (isAura) sfx.play('aura');

    for (let i = 0; i < text.length; i++) {
        currentText += text[i];
        entry.textContent = currentText;
        log.scrollTop = log.scrollHeight;
        if (i % 3 === 0 && !isAura) sfx.play('click'); 
        await sleep(10);
    }
}

async function runBootSequence() {
    sfx.init(); sfx.play('scan');
    const bootText = document.getElementById('boot-text');
    const lines = [
        "LUNAR_OS_TITAN KERNEL BOOT...",
        "INITIALIZING MEMORY BANKS [OK]",
        "CHECKING ENVIRONMENTAL SENSORS [OK]",
        "MOUNTING FILE SYSTEM [OK]",
        "LOADING UI MODULES..."
    ];
    for(let line of lines) {
        bootText.innerHTML += line + "<br>";
        sfx.play('click');
        await sleep(400);
    }
    await sleep(500);
    document.getElementById('screen-boot').classList.add('hidden');
    setTimeout(() => {
        document.getElementById('screen-boot').style.display = 'none';
        setScreen('screen-setup');
    }, 1000);
}

window.onload = () => {
    const saved = localStorage.getItem('lunarTitanV12');
    if(saved) {
        document.getElementById('screen-boot').style.display = 'none';
        state = JSON.parse(saved);
        sfx.init();
        if(state.ap > 0) {
            setScreen('screen-hud');
            updateUI(); drawMapSVG();
            logMsg("SESSION RESTORED.", "var(--primary)");
            logMsg("Welcome back, Commander. Systems remained stable.", "var(--aura)", true);
        } else {
            generateAuraMorningGreeting();
            setScreen('screen-metabolism');
        }
    } else {
        runBootSequence();
    }
};

function selectJob(j, btn) {
    sfx.init(); sfx.play('click');
    state.job = j;
    document.querySelectorAll('#job-select button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function toggleTrait(t, btn) {
    sfx.init(); sfx.play('click');
    if(state.traits.includes(t)) state.traits = state.traits.filter(x => x !== t);
    else state.traits.push(t);
    btn.classList.toggle('active');
}

async function triggerCinematicIntro() {
    if(!state.job) { sfx.init(); sfx.play('error'); return alert("OCCUPATION REQUIRED."); }
    sfx.init(); sfx.play('success');
    setScreen('screen-intro');
    sfx.setDroneFreq(120);

    const introBox = document.getElementById('intro-log');
    const lines = [
        "WARNING: CATASTROPHIC EVENT DETECTED.",
        "ATMOSPHERE VENTING...",
        "CREW BIOMETRICS UPDATING...",
        "CMDR. VANCE: FLATLINE.",
        "ENG. RIZZO: FLATLINE.",
        "DR. CHEN: FLATLINE.",
        "YOU ARE THE SOLE SURVIVOR. EXTRACTION T-MINUS 90 DAYS.",
        "BOOTING A.U.R.A. COMPANION AI..."
    ];

    for(let line of lines) {
        let p = document.createElement('div');
        introBox.appendChild(p);
        sfx.play('error');
        let cur = "";
        for(let i=0; i<line.length; i++) {
            cur += line[i];
            p.textContent = cur;
            await sleep(15);
        }
        await sleep(400);
    }
    sfx.setDroneFreq(55);
    document.getElementById('intro-btn').classList.remove('hidden');
}

async function bootSystem() {
    sfx.play('click');
    if(state.job === 'MINER') state.scr += 10;
    if(state.traits.includes('STRONG')) state.maxHp = 12;
    if(state.traits.includes('FRAIL')) state.maxHp = 8;
    if(state.traits.includes('HOARDER')) { state.scr += 10; state.ele += 5; }
    state.hp = state.maxHp;
    generateAuraMorningGreeting();
    setScreen('screen-metabolism');
}

function generateAuraMorningGreeting() {
    let text = "Good morning, Commander! I've prepared the synthesizer for your breakfast.";
    if (state.hp < 5) text = "Good morning... Please take it easy today. Your vitals are concerning me.";
    else if (state.foo < 6) text = "Good morning! My records show our nutrient paste is running low. Let's prioritize that.";
    else if (state.scr > 20) text = "Good morning! You've been quite industrious. Our scrap reserves are looking excellent!";
    else if (state.oxy < 8) text = "Commander, please review your oxygen usage today. I'm worried about the life support reserves.";
    document.getElementById('aura-morning-text').innerText = `"${text}"`;
}

function rollWeather() {
    let r = Math.random();
    if(r < 0.5) state.weather = 'CLEAR';
    else if(r < 0.7) state.weather = 'RADIATION';
    else if(r < 0.9) state.weather = 'SOLAR_FLARE';
    else state.weather = 'METEOR_STORM';
}

function processMetabolism(cost, yieldAmount) {
    if(state.foo < cost) {
        sfx.play('error');
        document.getElementById('metab-warning').innerText = "INSUFFICIENT NUTRIENTS FOR SELECTED CYCLE.";
        return;
    }
    sfx.play('success');
    
    if(state.traits.includes('FRAIL')) yieldAmount += 1;
    state.foo -= cost;
    state.ap = yieldAmount;
    
    let tax = 1;
    if(state.traits.includes('EFFICIENT') && state.day % 2 === 0) tax = 0;
    state.oxy -= tax; state.wat -= tax;
    
    rollWeather();
    
    if(state.sys.solar > 0 && state.weather !== 'SOLAR_FLARE') state.bat += state.sys.solar;
    if(state.sys.condenser > 0 && state.bat > 0) { state.bat--; state.wat += 2; }
    if(state.sys.garden > 0) {
        state.gardenProgress++;
        if(state.gardenProgress >= 3) {
            let y = state.job === 'BOTANIST' ? 15 : 10;
            state.foo += y;
            state.gardenProgress = 0;
            state.sys.garden = 0;
        }
    }
    
    if(state.weather === 'METEOR_STORM') {
        state.scr = Math.max(0, state.scr - Math.floor(Math.random()*5));
        if(state.sys.solar > 0 && Math.random() > 0.5) state.sys.solar--;
    }

    if(state.traits.includes('OPTIMIST') && Math.random() < 0.2) state.ap += 1;

    setScreen('screen-hud');
    initDay();
}

function restartGame() {
    if(confirm("WARNING: Are you sure you want to abort the mission? All progress will be lost and the save file will be wiped.")) {
        localStorage.removeItem('lunarTitanV12');
        location.reload();
    }
}

async function initDay() {
    saveGame();
    updateUI();
    drawMapSVG();
    await logMsg(`--- CYCLE ${String(state.day).padStart(2,'0')} INITIALIZED ---`, 'var(--primary)');
    
    let auraGreet = "All systems green. I am ready to assist you today, Commander.";
    if (state.weather === 'RADIATION') auraGreet = "Warning: Radiation spikes detected. Avoid external expeditions.";
    if (state.weather === 'SOLAR_FLARE') auraGreet = "Solar flare active. Our power generation is completely jammed.";
    if (state.weather === 'METEOR_STORM') auraGreet = "Brace yourself! Meteor storm is battering the hull!";
    if (state.hp < 5) auraGreet = "Please be careful today, your physical integrity is compromised.";
    await logMsg(auraGreet, 'var(--aura)', true);

    if(state.oxy <= 4 || state.wat <= 4) await logMsg("WARNING: Vitals Critical.", 'var(--warn)');
    checkFailure();
}

async function endCycle() {
    if(inputLocked) return;
    lockUI(true);
    sfx.play('click');
    setScreen('screen-shutdown');
    document.getElementById('shutdown-text').innerHTML = "SAVING CYCLE DATA...<br>ENTERING LOW POWER MODE...";
    await sleep(2000);
    state.day++; state.ap = 0;
    
    if(state.day > 90) {
        alert("VICTORY! EXTRACTION TEAM SECURED. YOU SURVIVED.");
        localStorage.removeItem('lunarTitanV12'); location.reload(); return;
    }

    generateAuraMorningGreeting();
    setScreen('screen-metabolism');
    document.getElementById('metab-warning').innerText = "";
    lockUI(false);
}

function checkFailure() {
    let msg = "";
    if(state.hp <= 0) msg = "BIOMETRIC FAILURE: ZERO INTEGRITY.";
    else if(state.oxy <= 0) msg = "BIOMETRIC FAILURE: ASPHYXIATION.";
    else if(state.wat <= 0) msg = "BIOMETRIC FAILURE: DEHYDRATION.";
    
    if(msg) {
        alert(`GAME OVER\n${msg}`);
        localStorage.removeItem('lunarTitanV12'); location.reload();
    }
}

function lockUI(locked) {
    inputLocked = locked;
    renderActions();
}

function updateUI() {
    document.getElementById('hud-day').innerText = `CYCLE: ${String(state.day).padStart(2,'0')} / 90`;
    document.getElementById('hud-profile').innerText = `ROLE: ${state.job} | [${state.traits.join(',')}]`;
    document.getElementById('hud-ap').innerText = state.ap;
    
    let wCol = state.weather === 'CLEAR' ? 'var(--success)' : 'var(--danger)';
    document.getElementById('loc-weather').innerText = `WEATHER: ${state.weather}`;
    document.getElementById('loc-weather').style.color = wCol;

    const p_hp = (state.hp/state.maxHp)*100;
    const p_ox = (state.oxy/20)*100;
    const p_wa = (state.wat/20)*100;
    const p_fo = (state.foo/20)*100;

    document.getElementById('hud-vitals').innerHTML = `
        <div class="stat-row"><span>INTEGRITY</span> <span class="stat-val ${state.hp<4?'crit':''}">${state.hp}/${state.maxHp}</span></div>
        <div class="progress-bar"><div class="progress-fill ${state.hp<4?'crit':''}" style="width:${p_hp}%"></div></div>
        <div class="stat-row" style="margin-top:10px"><span>O2 SUPPLY</span> <span class="stat-val ${state.oxy<4?'crit':''}">${state.oxy}</span></div>
        <div class="progress-bar"><div class="progress-fill ${state.oxy<4?'crit':''}" style="width:${p_ox}%"></div></div>
        <div class="stat-row" style="margin-top:10px"><span>H2O RESERVE</span> <span class="stat-val ${state.wat<4?'crit':''}">${state.wat}</span></div>
        <div class="progress-bar"><div class="progress-fill ${state.wat<4?'crit':''}" style="width:${p_wa}%"></div></div>
        <div class="stat-row" style="margin-top:10px"><span>NUTRIENTS</span> <span class="stat-val ${state.foo<4?'crit':''}">${state.foo}</span></div>
        <div class="progress-bar"><div class="progress-fill ${state.foo<4?'crit':''}" style="width:${p_fo}%"></div></div>
    `;

    document.getElementById('hud-inv').innerHTML = `
        <div class="stat-row"><span>⚙️ SCRAP_MTL</span> <span class="stat-val">${state.scr}</span></div>
        <div class="stat-row"><span>💻 ELECTRONICS</span> <span class="stat-val">${state.ele}</span></div>
        <div class="stat-row"><span>⚡ BATT_CELLS</span> <span class="stat-val">${state.bat}</span></div>
        <div class="stat-row"><span>🧬 RESEARCH</span> <span class="stat-val">${state.res}</span></div>
    `;
    
    let sysHtml = `<div class="stat-row"><span>☀️ SOLAR ARRAY</span> <span class="stat-val">LVL ${state.sys.solar}</span></div>`;
    if(state.sys.condenser > 0) sysHtml += `<div class="stat-row"><span>💧 CONDENSER</span> <span class="stat-val">ON</span></div>`;
    if(state.sys.garden > 0) sysHtml += `<div class="stat-row"><span>🌱 GARDEN</span> <span class="stat-val">${state.gardenProgress}/3</span></div>`;
    if(state.sys.comms > 0) sysHtml += `<div class="stat-row"><span>📡 COMMS</span> <span class="stat-val">ON</span></div>`;
    if(state.sys.medbay > 0) sysHtml += `<div class="stat-row"><span>⚕️ MEDBAY</span> <span class="stat-val">ON</span></div>`;
    if(state.sys.turret > 0) sysHtml += `<div class="stat-row"><span>🔫 TURRET</span> <span class="stat-val">ON</span></div>`;
    document.getElementById('hud-sys').innerHTML = sysHtml;

    renderActions();
}

function renderActions() {
    const list = document.getElementById('action-list');
    list.innerHTML = '';
    let dis = inputLocked ? 'disabled' : '';

    if(state.loc === 'Base') {
        let posKey = `${state.px},${state.py}`;
        let cell = GRID_LAYOUT[posKey];
        
        list.innerHTML += `<div style="text-align:center; color:var(--primary); margin-bottom:10px;">STANDING IN: ${cell ? cell.name : 'CORRIDOR'}</div>`;

        if(posKey === '2,2') {
            list.innerHTML += `<button onclick="actionScavenge()" ${dis}>[ BASE PERIMETER SCAVENGE ] <span class="cost">1 AP</span></button>`;
            let tCost = state.job === 'SCOUT' ? 1 : 2;
            list.innerHTML += `<button onclick="actionTravelMenu()" ${dis}>[ EXPEDITION MENU ] <span class="cost">${tCost} AP</span></button>`;
            list.innerHTML += `<button onclick="actionResearch()" ${(state.ap < 2 || inputLocked) ? 'disabled':''}>[ RUN RESEARCH ] <span class="cost">2 AP</span></button>`;
            
            list.innerHTML += `<div style="text-align:center; color:#555; font-size:0.75rem; margin:10px 0;">--- BUILD SYS (ADJACENT) ---</div>`;
            let eng = state.job === 'ENGINEER';
            
            let rCost = eng ? 2 : 4;
            list.innerHTML += `<button onclick="actionRepair('solar')" ${(state.ele < rCost || state.ap < 1 || inputLocked) ? 'disabled':''}>BUILD SOLAR <span class="cost">1 AP / ${rCost} ELEC</span></button>`;
            
            if(state.sys.condenser === 0) {
                let cScr = eng ? 2 : 4; let cEle = eng ? 1 : 2;
                list.innerHTML += `<button onclick="actionRepair('condenser')" ${(state.scr < cScr || state.ele < cEle || state.ap < 1 || inputLocked) ? 'disabled':''}>BUILD CONDENSER <span class="cost">1 AP / ${cScr}S ${cEle}E</span></button>`;
            }
            if(state.sys.comms === 0) {
                let cmEle = eng ? 3 : 5;
                list.innerHTML += `<button onclick="actionRepair('comms')" ${(state.ele < cmEle || state.ap < 1 || inputLocked) ? 'disabled':''}>BUILD COMMS <span class="cost">1 AP / ${cmEle} ELEC</span></button>`;
            }
            if(state.sys.medbay === 0) {
                let mScr = eng ? 3 : 5; let mEle = eng ? 2 : 3;
                list.innerHTML += `<button onclick="actionRepair('medbay')" ${(state.scr < mScr || state.ele < mEle || state.ap < 1 || inputLocked) ? 'disabled':''}>BUILD MEDBAY <span class="cost">1 AP / ${mScr}S ${mEle}E</span></button>`;
            }
            if(state.sys.garden === 0) {
                list.innerHTML += `<button onclick="actionRepair('garden')" ${(state.scr < 2 || state.ele < 1 || state.ap < 1 || inputLocked) ? 'disabled':''}>BUILD GARDEN <span class="cost">1 AP / 2S 1E</span></button>`;
            }
            if(state.sys.turret === 0) {
                let tScr = eng ? 4 : 6; let tEle = eng ? 3 : 4;
                list.innerHTML += `<button onclick="actionRepair('turret')" ${(state.scr < tScr || state.ele < tEle || state.ap < 1 || inputLocked) ? 'disabled':''}>BUILD TURRET <span class="cost">1 AP / ${tScr}S ${tEle}E</span></button>`;
            }
        } else if (posKey === '2,1' && state.sys.solar > 0) {
            let rCost = state.job === 'ENGINEER' ? 2 : 4;
            list.innerHTML += `<button onclick="actionRepair('solar')" ${(state.ele < rCost || state.ap < 1 || inputLocked) ? 'disabled':''}>UPGRADE SOLAR <span class="cost">1 AP / ${rCost} ELEC</span></button>`;
        } else if (posKey === '2,3' && state.sys.medbay > 0) {
            let mbCost = state.job === 'MEDIC' ? 0 : 1;
            list.innerHTML += `<button onclick="actionHeal()" ${(state.bat < 1 || state.wat < 1 || state.ap < mbCost || inputLocked || state.hp >= state.maxHp) ? 'disabled':''}>[ USE MEDBAY ] <span class="cost">${mbCost} AP / 1P 1W</span></button>`;
        } else if (posKey === '3,2') {
            if(state.sys.garden === 0) {
                list.innerHTML += `<button onclick="actionPlant()" ${(state.wat < 2 || state.ap < 1 || inputLocked) ? 'disabled':''}>[ PLANT SEEDS ] <span class="cost">1 AP / 2 WAT</span></button>`;
            } else {
                list.innerHTML += `<div style="text-align:center; color:#555;">GARDEN GROWING...</div>`;
            }
        } else {
            list.innerHTML += `<div style="text-align:center; color:#555;">SYSTEM INACTIVE OR NO ACTIONS HERE.</div>`;
        }
    } else {
        list.innerHTML += `<button onclick="actionScavenge()" ${dis}>[ HIGH-YIELD SCAVENGE ] <span class="cost">1 AP</span></button>`;
        if (state.loc === 'Sat' && state.sys.comms > 0) list.innerHTML += `<button onclick="actionDeepHack()" ${(state.ap < 2 || inputLocked) ? 'disabled':''}>[ DEEP HACK ] <span class="cost">2 AP</span></button>`;
        if (state.loc === 'Crater') list.innerHTML += `<button onclick="actionDrill()" ${(state.bat < 1 || state.ap < 1 || inputLocked) ? 'disabled':''}>[ THERMAL DRILL ] <span class="cost">1 AP / 1 PWR</span></button>`;
        if (state.loc === 'Pod' && !state.podDismantled) list.innerHTML += `<button onclick="actionDismantle()" ${(state.ap < 2 || inputLocked) ? 'disabled':''}>[ DISMANTLE POD ] <span class="cost">2 AP</span></button>`;
        
        let tCost = state.job === 'SCOUT' ? 1 : 2;
        list.innerHTML += `<button onclick="actionTravel('Base')" style="border-color:var(--warn)" ${dis}>[ RETURN TO BASE ] <span class="cost">${tCost} AP</span></button>`;
    }

    list.innerHTML += `<div style="margin-top:auto; display:flex; flex-direction:column; gap:5px;">
        <button onclick="endCycle()" style="background:rgba(255,183,0,0.1); border-color:var(--warn); color:var(--warn); width:100%;" ${dis}>[ TERMINATE CYCLE ]</button>
        <button onclick="restartGame()" style="background:rgba(255,42,42,0.1); border-color:var(--danger); color:var(--danger); width:100%;" ${dis}>[ SYSTEM REBOOT (ABORT) ]</button>
    </div>`;
}

function movePlayer(x, y) {
    if(inputLocked || state.loc !== 'Base') return;
    let dx = Math.abs(state.px - x);
    let dy = Math.abs(state.py - y);
    if((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
        state.px = x; state.py = y;
        sfx.play('click');
        updateUI(); drawMapSVG();
    }
}

async function actionScavenge() {
    if(state.ap < 1 || inputLocked) return;
    lockUI(true); state.ap--; updateUI();
    sfx.play('scan');
    await logMsg("Scanning vicinity...", "var(--text)");
    await sleep(800);

    if(state.weather === 'RADIATION' && state.loc !== 'Base') {
        state.hp -= 1;
        sfx.play('error');
        await logMsg("RADIATION SPIKE! Took 1 DMG.", "var(--danger)");
        if(state.hp <= 0) { checkFailure(); return; }
    }

    if(state.loc !== 'Base' && Math.random() > 0.8) {
        await logMsg("ANOMALY DETECTED. ENCRYPTED CACHE FOUND.", "var(--warn)");
        await sleep(500);
        initHack();
        return; 
    }

    if (Math.random() < 0.25) {
        let lore = LORE_DATALOGS[Math.floor(Math.random() * LORE_DATALOGS.length)];
        sfx.play('success');
        await logMsg(`[DATALOG] ${lore}`, "var(--secondary)");
        await logMsg("Archived.", "var(--aura)", true);
        await sleep(1500);
    }

    let baseYield = Math.floor(Math.random() * 2); 
    if(state.job === 'MINER') baseYield += 1;
    if(state.res > 5) baseYield += 1;

    if(baseYield === 0 && state.loc === 'Base') {
        await logMsg("Found nothing but lunar dust.", "var(--text)");
        await logMsg("Don't worry, we'll find more next time!", "var(--aura)", true);
    } else {
        if(state.loc === 'Sat') {
            if(Math.random() > 0.5) state.ele += 1;
            state.scr += baseYield;
            await logMsg(`Secured: +${baseYield} SCRAP.`, "var(--success)");
        } else if (state.loc === 'Crater') {
            state.wat += 1; state.scr += baseYield;
            await logMsg(`Secured: +${baseYield} SCRAP, +1 H2O.`, "var(--success)");
        } else if (state.loc === 'Pod') {
            state.foo += 2; state.scr += baseYield;
            await logMsg(`Secured: +${baseYield} SCRAP, +2 FOO.`, "var(--success)");
        } else {
            state.scr += baseYield;
            await logMsg(`Secured: +${baseYield} SCRAP.`, "var(--success)");
        }
        sfx.play('success');
    }
    updateUI(); lockUI(false);
}

async function actionDrill() {
    if(state.ap < 1 || state.bat < 1 || inputLocked) return;
    lockUI(true); state.ap--; state.bat--; updateUI();
    sfx.play('scan');
    await logMsg("Deploying thermal drill...", "var(--text)");
    await sleep(1000);
    state.wat += 6;
    sfx.play('success');
    await logMsg("Extracted massive ice chunk. +6 H2O.", "var(--success)");
    updateUI(); lockUI(false);
}

async function actionDismantle() {
    if(state.ap < 2 || inputLocked) return;
    lockUI(true); state.ap -= 2; updateUI();
    sfx.play('error');
    await logMsg("Tearing apart drop pod hull...", "var(--text)");
    await sleep(1000);
    state.scr += 10;
    state.ele += 2;
    state.podDismantled = true;
    sfx.play('success');
    await logMsg("Pod dismantled. +10 SCRAP, +2 ELEC.", "var(--success)");
    updateUI(); lockUI(false);
}

async function actionDeepHack() {
    if(state.ap < 2 || inputLocked) return;
    lockUI(true); state.ap -= 2; updateUI();
    sfx.play('scan');
    await logMsg("Using Comms Array to brute force local network...", "var(--text)");
    await sleep(1000);
    if(state.job === 'HACKER' || Math.random() > 0.3) {
        state.ele += 4;
        sfx.play('success');
        await logMsg("Hack successful. +4 ELEC.", "var(--success)");
    } else {
        sfx.play('error');
        await logMsg("Firewall retaliated. Hack failed.", "var(--danger)");
    }
    updateUI(); lockUI(false);
}

async function actionHeal() {
    let mbCost = state.job === 'MEDIC' ? 0 : 1;
    if(state.ap < mbCost || state.bat < 1 || state.wat < 1 || inputLocked) return;
    lockUI(true); state.ap -= mbCost; state.bat--; state.wat--; updateUI();
    sfx.play('success');
    await logMsg("Applying med-gel and bio-stimulants...", "var(--text)");
    await sleep(800);
    state.hp = Math.min(state.maxHp, state.hp + 4);
    await logMsg("Integrity restored.", "var(--success)");
    updateUI(); lockUI(false);
}

async function actionPlant() {
    if(state.ap < 1 || state.wat < 2 || inputLocked) return;
    lockUI(true); state.ap--; state.wat -= 2; updateUI();
    sfx.play('click');
    await logMsg("Seeding hydroponics...", "var(--text)");
    await sleep(800);
    state.sys.garden = 1; state.gardenProgress = 0;
    await logMsg("Garden planted. Harvest in 3 days.", "var(--success)");
    updateUI(); lockUI(false);
}

async function actionResearch() {
    if(state.ap < 2 || inputLocked) return;
    lockUI(true); state.ap -= 2; updateUI();
    sfx.play('scan');
    await logMsg("Processing environmental data...", "var(--text)");
    await logMsg("Running parallel analysis routines.", "var(--aura)", true);
    await sleep(1200);
    let gain = (state.traits.includes('GENIUS')) ? 2 : 1;
    state.res += gain;
    sfx.play('success');
    await logMsg(`Research cataloged. Efficiency +${gain}.`, "var(--success)");
    updateUI(); lockUI(false);
}

async function actionRepair(sys) {
    if(inputLocked) return;
    let eng = state.job === 'ENGINEER';
    let costScr = 0, costEle = 0;
    
    if(sys === 'solar') costEle = eng ? 2 : 4;
    if(sys === 'condenser') { costScr = eng ? 2 : 4; costEle = eng ? 1 : 2; }
    if(sys === 'comms') { costEle = eng ? 3 : 5; }
    if(sys === 'medbay') { costScr = eng ? 3 : 5; costEle = eng ? 2 : 3; }
    if(sys === 'garden') { costScr = 2; costEle = 1; }
    if(sys === 'turret') { costScr = eng ? 4 : 6; costEle = eng ? 3 : 4; }

    if(state.ap < 1 || state.scr < costScr || state.ele < costEle) return;
    lockUI(true); state.ap--; state.scr -= costScr; state.ele -= costEle; updateUI();

    sfx.play('click');
    await logMsg(`Initiating hardware construction...`, "var(--text)");
    await sleep(1000);

    state.sys[sys]++;
    sfx.play('success');
    await logMsg(`SYSTEM ONLINE: ${sys.toUpperCase()}.`, "var(--success)");
    updateUI(); lockUI(false);
}

function actionTravelMenu() {
    if (inputLocked) return;
    const list = document.getElementById('action-list');
    list.innerHTML = `<h3>NAV_TARGETS</h3>`;
    for(let key in LOCATIONS) {
        if(key === 'Base') continue;
        if(key === 'Pod' && state.podDismantled) continue;
        let tCost = state.job === 'SCOUT' ? 1 : 2;
        list.innerHTML += `<button onclick="actionTravel('${key}')">${LOCATIONS[key].name} <span class="cost">${tCost} AP</span></button>`;
    }
    list.innerHTML += `<button onclick="renderActions()">[ CANCEL ]</button>`;
}

async function actionTravel(dest) {
    let tCost = state.job === 'SCOUT' ? 1 : 2;
    if(state.ap < tCost || inputLocked) return;
    lockUI(true); state.ap -= tCost; updateUI();

    sfx.play('click');
    await logMsg(`Plotting coordinates for ${LOCATIONS[dest].name}...`, "var(--text)");
    await logMsg("Routing around known hazard zones.", "var(--aura)", true);
    await sleep(800);
    
    if(state.weather === 'RADIATION') {
        state.hp -= 1;
        sfx.play('error');
        await logMsg("RADIATION SPIKE DURING TRANSIT! Took 1 DMG.", "var(--danger)");
        if(state.hp <= 0) { checkFailure(); return; }
    }

    if(dest !== 'Base' && !state.traits.includes('PARANOID') && Math.random() > 0.6) {
        sfx.play('error');
        await logMsg("WARNING: HOSTILE INTERCEPT.", "var(--warn)");
        await sleep(800);
        initCombat(dest);
        return;
    }

    resolveTravel(dest);
}

async function resolveTravel(dest) {
    state.loc = dest;
    if(dest === 'Base') { state.px = 2; state.py = 2; }
    document.getElementById('loc-name').innerText = LOCATIONS[dest].name;
    document.getElementById('loc-name').style.color = LOCATIONS[dest].color;
    sfx.play('success');
    await logMsg(`Arrived at ${LOCATIONS[dest].name}.`, "var(--success)");
    drawMapSVG();
    updateUI(); lockUI(false);
}

async function initCombat(pendingDest) {
    sfx.setDroneFreq(120); sfx.play('combat');
    state.combat.active = true;
    
    let r = Math.random();
    if(r < 0.4) { state.combat.type = 'SCOUT DRONE'; state.combat.enemyHp = 50; }
    else if(r < 0.8) { state.combat.type = 'BIO-MUTANT'; state.combat.enemyHp = 80; }
    else { state.combat.type = 'DEFENSE MECH'; state.combat.enemyHp = 150; }
    
    state.combat.dest = pendingDest;
    
    if(state.sys.turret > 0 && state.loc === 'Base') {
        state.combat.enemyHp -= 50;
        await logMsg("AUTO-TURRET FIRED! Enemy took massive damage.", "var(--success)");
    }
    
    document.getElementById('combat-type').innerText = state.combat.type;
    document.getElementById('combat-hp').innerText = state.combat.enemyHp;
    document.getElementById('aura-combat-text').innerText = `"Evasive maneuvers recommended! That ${state.combat.type} looks angry."`;
    
    let cBtns = document.getElementById('combat-buttons-container');
    cBtns.innerHTML = `
        <button class="btn-danger" onclick="executeCombat('quick')" style="width: 200px; justify-content:center;">[ QUICK STRIKE ]</button>
        <button class="btn-danger" onclick="executeCombat('heavy')" style="width: 200px; justify-content:center;">[ HEAVY STRIKE (70%) ]</button>
        <button class="btn-danger" onclick="executeCombat('plasma')" style="width: 200px; justify-content:center; ${state.bat < 1 ? 'opacity:0.3; pointer-events:none;':''}">[ PLASMA BLAST (1 PWR) ]</button>
        <button onclick="executeCombat('evade')" style="width: 200px; justify-content:center;">[ EVADE ]</button>
    `;

    document.getElementById('overlay-combat').classList.remove('hidden');
    lockUI(false); 
}

async function executeCombat(action) {
    if(inputLocked) return;
    lockUI(true);
    
    let hit = true; let dmg = 0;
    
    if(action === 'quick') {
        dmg = state.job === 'SOLDIER' ? 25 : 15;
        sfx.play('combat');
    } else if (action === 'heavy') {
        hit = Math.random() > 0.3;
        dmg = state.job === 'SOLDIER' ? 45 : 30;
        sfx.play('combat');
    } else if (action === 'plasma') {
        if(state.bat < 1) { lockUI(false); return; }
        state.bat--; hit = true; dmg = 80;
        sfx.play('scan');
    } else if (action === 'evade') {
        sfx.play('click');
    }

    if(action !== 'evade') {
        document.getElementById('svg-drone').classList.add('shake');
        setTimeout(() => document.getElementById('svg-drone').classList.remove('shake'), 300);
        
        if(hit) {
            state.combat.enemyHp -= dmg;
            await logMsg(`STRIKE LANDED. Dealt ${dmg} DMG.`, "var(--text)");
        } else {
            await logMsg(`STRIKE MISSED.`, "var(--warn)");
        }
        
        document.getElementById('combat-hp').innerText = Math.max(0, state.combat.enemyHp);
        await sleep(800);
        
        if(state.combat.enemyHp <= 0) {
            sfx.play('success');
            await logMsg(`THREAT NEUTRALIZED.`, "var(--success)");
            endCombat(true);
            return;
        }
    } else {
        await logMsg(`EVASIVE MANEUVERS ENGAGED.`, "var(--text)");
        await sleep(800);
    }

    sfx.play('error');
    document.getElementById('main-viewscreen').classList.add('shake');
    setTimeout(() => document.getElementById('main-viewscreen').classList.remove('shake'), 300);
    
    let eDmg = 0;
    if(state.combat.type === 'SCOUT DRONE') eDmg = 1;
    if(state.combat.type === 'BIO-MUTANT') eDmg = 2;
    if(state.combat.type === 'DEFENSE MECH') eDmg = 3;
    
    if(action === 'evade') { eDmg = Math.floor(eDmg / 2); }
    
    if(eDmg > 0) {
        state.hp -= eDmg;
        await logMsg(`ENEMY STRIKES! TOOK ${eDmg} DMG.`, "var(--danger)");
        updateUI();
    } else {
        await logMsg(`EVADED ENEMY ATTACK.`, "var(--success)");
    }

    if(state.hp <= 0) {
        checkFailure();
    } else {
        lockUI(false);
    }
}

function endCombat(won) {
    document.getElementById('overlay-combat').classList.add('hidden');
    sfx.setDroneFreq(55);
    state.combat.active = false;
    if(won && state.combat.dest) resolveTravel(state.combat.dest);
    else { lockUI(false); updateUI(); }
}

function initHack() {
    sfx.setDroneFreq(200);
    state.hack.active = true;
    state.hack.tries = 3;
    state.hack.found = 0;
    document.getElementById('hack-tries').innerText = state.hack.tries;
    
    let arr = []; while(arr.length < 3) { let r = Math.floor(Math.random()*16); if(arr.indexOf(r) === -1) arr.push(r); }
    state.hack.targetKeys = arr;

    const grid = document.getElementById('hack-grid');
    grid.innerHTML = '';
    for(let i=0; i<16; i++) {
        let n = document.createElement('div');
        n.className = 'hack-node'; n.innerText = Math.floor(Math.random()*99);
        n.onclick = () => processHackNode(n, i);
        grid.appendChild(n);
    }
    
    document.getElementById('overlay-hack').classList.remove('hidden');
    lockUI(false);
}

async function processHackNode(node, index) {
    if(node.classList.contains('solved') || node.classList.contains('failed') || inputLocked) return;
    lockUI(true);

    if(state.hack.targetKeys.includes(index)) {
        sfx.play('click');
        node.classList.add('solved');
        state.hack.found++;
        if(state.hack.found >= 3) {
            sfx.play('success');
            await logMsg("ENCRYPTION BROKEN. +3 ELEC, +5 SCRAP.", "var(--success)");
            await logMsg("We did it! You're quite the slicer, Commander.", "var(--aura)", true);
            state.ele += 3; state.scr += 5; updateUI();
            abortHack();
            return;
        }
    } else {
        sfx.play('error');
        node.classList.add('failed');
        state.hack.tries--;
        document.getElementById('hack-tries').innerText = state.hack.tries;
        if(state.hack.tries <= 0) {
            await logMsg("SECURITY LOCKOUT. ACCESS DENIED.", "var(--danger)");
            await logMsg("Darn it. They changed their encryption keys.", "var(--aura)", true);
            abortHack();
            return;
        }
    }
    lockUI(false);
}

function abortHack() {
    document.getElementById('overlay-hack').classList.add('hidden');
    sfx.setDroneFreq(55);
    state.hack.active = false;
    lockUI(false); updateUI();
}

function drawMapSVG() {
    const svg = document.getElementById('svg-view');
    const col = LOCATIONS[state.loc].color;
    
    let html = '';

    if(state.loc === 'Base') {
        for(let y=0; y<5; y++) {
            for(let x=0; x<5; x++) {
                let cx = 400 + (x-2)*65;
                let cy = 200 + (y-2)*65;
                let cell = GRID_LAYOUT[`${x},${y}`];
                let strokeCol = 'var(--border)';
                let fillCol = 'none';
                let txt = '';
                
                if(cell) {
                    if(cell.id === 'hub') {
                        strokeCol = cell.col;
                        txt = 'HUB';
                    } else if(state.sys[cell.req] > 0) {
                        strokeCol = cell.col;
                        fillCol = 'rgba(0,240,255,0.05)';
                        txt = cell.id.substring(0,3).toUpperCase();
                    }
                }

                if(x === state.px && y === state.py) {
                    strokeCol = 'var(--text)';
                    fillCol = 'rgba(255,255,255,0.2)';
                }

                html += `<rect x="${cx-30}" y="${cy-30}" width="60" height="60" fill="${fillCol}" stroke="${strokeCol}" stroke-width="2" class="map-tile" onclick="movePlayer(${x},${y})"/>`;
                if(txt) html += `<text x="${cx}" y="${cy+5}" fill="${strokeCol}" text-anchor="middle" font-size="10" pointer-events="none">${txt}</text>`;
            }
        }
        html += `<circle cx="${400 + (state.px-2)*65}" cy="${200 + (state.py-2)*65}" r="5" fill="var(--text)" pointer-events="none"/>`;
    } else {
        html += `
            <line x1="0" y1="200" x2="800" y2="200" stroke="var(--border)" stroke-width="1"/>
            <line x1="400" y1="0" x2="400" y2="400" stroke="var(--border)" stroke-width="1"/>
            <circle cx="400" cy="200" r="100" fill="none" stroke="var(--border)" stroke-width="1" opacity="0.5"/>
            <circle cx="400" cy="200" r="200" fill="none" stroke="var(--border)" stroke-width="1" opacity="0.5"/>
            <rect x="360" y="160" width="80" height="80" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="10,5">
                <animateTransform attributeName="transform" type="rotate" from="0 400 200" to="360 400 200" dur="10s" repeatCount="indefinite"/>
            </rect>
            <circle cx="400" cy="200" r="5" fill="${col}"/>
            <text x="400" y="150" fill="${col}" text-anchor="middle" font-size="12">EXTERIOR ZONE</text>
        `;
    }
    svg.innerHTML = html;
}

function saveGame() {
    localStorage.setItem('lunarTitanV12', JSON.stringify(state));
}
