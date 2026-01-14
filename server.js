const { initializeApp } = require("firebase/app");
const { getDatabase, ref, update, get, child, set, runTransaction } = require("firebase/database");
const express = require('express'); // REQUIRED for UptimeRobot

// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCW9kmbU2qhKZEH4_pj-yzK7kODv1XFQVQ",
    authDomain: "spin-wheel-809ac.firebaseapp.com",
    databaseURL: "https://spin-wheel-809ac-default-rtdb.firebaseio.com",
    projectId: "spin-wheel-809ac",
    storageBucket: "spin-wheel-809ac.firebasestorage.app",
    messagingSenderId: "681956408852",
    appId: "1:681956408852:web:687abe77bf1c8e46d93101"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- 2. GAME SETTINGS ---
const CYCLE_TIME = 180; // 3 Minutes
let timer = CYCLE_TIME;
let status = "BETTING"; 

console.log("✅ ROYAL VEGAS SERVER - CENTRALIZED SYNC STARTED");
console.log("-----------------------------------------------");

// --- 3. MAIN SERVER LOOP (Runs every 1 second) ---
setInterval(async () => {
    // A. Daily Reset Check
    checkDailyReset();

    // B. Betting Phase
    if (status === "BETTING") {
        timer--;
        
        // Broadcast time to all clients (PC & Mobile)
        update(ref(db, 'game_state'), {
            time_left: timer,
            status: "BETTING"
        }).catch(e => console.error("Sync Error:", e));

        // C. Trigger Spin
        if (timer <= 0) {
            await runSpinSequence();
        }
    }
}, 1000);

// --- 4. SPIN LOGIC ---
async function runSpinSequence() {
    status = "SPINNING";
    console.log("\n\n🎰 STARTING SPIN SEQUENCE...");

    // A. DETERMINE RESULT (Check Admin Rigging)
    let finalResult = Math.floor(Math.random() * 12) + 1; // Default Random
    let finalMulti = 1;

    try {
        const snapshot = await get(child(ref(db), 'house_control'));
        if (snapshot.exists()) {
            const data = snapshot.val();
            
            if (data.number && data.number > 0) {
                finalResult = parseInt(data.number);
                console.log(`⚠️  ADMIN OVERRIDE APPLIED: #${finalResult}`);
            }
            if (data.multiplier && data.multiplier >= 1) {
                finalMulti = parseInt(data.multiplier);
                console.log(`⚠️  MULTIPLIER ACTIVE: ${finalMulti}x`);
            }
        }
    } catch (e) { console.error("Error reading house_control:", e); }

    // B. BROADCAST RESULT TO CLIENTS
    update(ref(db, 'game_state'), {
        status: "SPINNING",
        result: finalResult,
        multiplier: finalMulti,
        time_left: 0
    });

    // C. SAVE HISTORY
    const historyId = Date.now().toString();
    set(ref(db, `results_history/${historyId}`), {
        result: finalResult,
        timestamp: Date.now()
    });

    // D. CALCULATE HOUSE VOLUME
    const betsSnap = await get(child(ref(db), 'current_round_bets'));
    let totalPayout = 0;

    if (betsSnap.exists()) {
        const allPlayers = betsSnap.val();
        Object.values(allPlayers).forEach(playerBets => {
            if (playerBets[finalResult]) {
                const winAmount = (playerBets[finalResult] * 10 * finalMulti);
                totalPayout += winAmount;
            }
        });
    }

    if (totalPayout > 0) {
        console.log(`💸 PAYOUT PROCESSED: ₹${totalPayout}`);
        const volRef = ref(db, 'house_stats/daily_volume');
        await runTransaction(volRef, (currentVol) => {
            return (currentVol || 0) - totalPayout;
        });
    } else {
        console.log("💸 NO WINNERS THIS ROUND");
    }

    // E. CLEANUP
    set(ref(db, 'current_round_bets'), {});
    update(ref(db, 'house_control'), { number: 0, multiplier: 1 });

    // F. WAIT FOR ANIMATION THEN RESET
    console.log("⏳ Waiting for client animations...");
    setTimeout(() => {
        resetGame();
    }, 12000);
}

function resetGame() {
    status = "BETTING";
    timer = CYCLE_TIME;
    
    update(ref(db, 'game_state'), {
        status: "BETTING",
        time_left: CYCLE_TIME
    });
    
    console.log("🔄 NEW ROUND STARTED\n");
}

// --- 5. DAILY VOLUME RESET ---
async function checkDailyReset() {
    const volRef = child(ref(db), 'house_stats');
    const snapshot = await get(volRef);
    const stats = snapshot.val() || {};
    
    const now = Date.now();
    const lastReset = stats.last_reset || 0;
    
    if (now - lastReset > 86400000) {
        console.log("📅 24 HOURS PASSED - RESETTING DAILY VOLUME");
        update(ref(db, 'house_stats'), { 
            daily_volume: 0, 
            last_reset: now 
        });
    }
}

// --- 6. RENDER DEPLOYMENT SERVER ---
// DO NOT REMOVE THIS. UptimeRobot needs this to connect.
const appServer = express();
const port = process.env.PORT || 3000;

appServer.get('/', (req, res) => {
    res.send(`Royal Vegas Game Server is RUNNING. <br>Status: ${status} <br>Timer: ${timer}`);
});

appServer.listen(port, () => {
    console.log(`🚀 HTTP Server listening on port ${port}`);
});
// --- 7. SELF-PING STRATEGY (Keeps Server Alive) ---
// Render sleeps after 15 minutes of inactivity. 
// This code pings the server every 14 minutes to reset the timer.

const https = require('https'); 

const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; // Render automatically sets this

if (RENDER_EXTERNAL_URL) {
    console.log("⏰ Keep-Alive Activated for:", RENDER_EXTERNAL_URL);
    
    setInterval(() => {
        https.get(RENDER_EXTERNAL_URL, (res) => {
            if (res.statusCode === 200) {
                console.log("⚡ Keep-Alive Ping Successful");
            } else {
                console.error("⚠️ Keep-Alive Ping Failed:", res.statusCode);
            }
        }).on('error', (e) => {
            console.error("⚠️ Keep-Alive Ping Error:", e.message);
        });
    }, 14 * 60 * 1000); // Check every 14 minutes
} else {
    // Fallback if environment variable isn't set yet (e.g. running locally)
    console.log("⚠️ RENDER_EXTERNAL_URL not found. Self-ping inactive.");
}