import React, { useState, useEffect, useRef, useCallback } from "react";

const PHASES = [
  { key: "inhale", label: "吸って", sub: "Inhale", duration: 4 },
  { key: "hold1", label: "止めて", sub: "Hold", duration: 4 },
  { key: "exhale", label: "吐いて", sub: "Exhale", duration: 4 },
  { key: "hold2", label: "止めて", sub: "Hold", duration: 4 },
];

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(startKey, endKey) {
  const start = new Date(startKey);
  const end = new Date(endKey);
  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const day = String(cur.getDate()).padStart(2, "0");
    days.push({
      key: `${y}-${m}-${day}`,
      label: ["日", "月", "火", "水", "木", "金", "土"][cur.getDay()],
      dateLabel: `${Number(m)}/${Number(day)}`,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function getHistoryDays(history, range) {
  if (range !== "all") return lastNDays(range);
  const keys = Object.keys(history).sort();
  if (keys.length === 0) return lastNDays(7);
  return daysBetween(keys[0], todayKey());
}

function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    days.push({
      key: `${y}-${m}-${day}`,
      label: ["日", "月", "火", "水", "木", "金", "土"][d.getDay()],
      dateLabel: `${Number(m)}/${Number(day)}`,
    });
  }
  return days;
}

export default function BoxBreathing() {
  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PHASES[0].duration);
  const [cycles, setCycles] = useState(0);
  const [targetSets, setTargetSets] = useState(25);
  const [finished, setFinished] = useState(false);
  const [history, setHistory] = useState({});
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRange, setHistoryRange] = useState(7);
  const [soundOn, setSoundOn] = useState(true);
  const intervalRef = useRef(null);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (window.storage && window.storage.get) {
          const result = await window.storage.get("history");
          if (!cancelled && result && result.value) {
            setHistory(JSON.parse(result.value));
          }
        }
      } catch (e) {
        // no history yet, that's fine
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recordToday = useCallback(async (setsCompleted) => {
    const key = todayKey();
    setHistory((prev) => {
      const updated = {
        ...prev,
        [key]: (prev[key] || 0) + setsCompleted,
      };
      try {
        if (window.storage && window.storage.set) {
          window.storage.set("history", JSON.stringify(updated)).catch(() => {});
        }
      } catch (e) {
        // storage unavailable, keep going with in-memory state
      }
      return updated;
    });
  }, []);

  const unlockAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {
      // audio not available, fail silently
    }
  }, []);

  const playTick = useCallback((accent) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = accent ? 920 : 520;
      const peak = accent ? 0.28 : 0.12;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (accent ? 0.18 : 0.1));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {
      // audio not available, fail silently
    }
  }, []);

  const playChime = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      const notes = [660, 880, 1320];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = now + i * 0.35;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.22, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 1.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 1.5);
      });
    } catch (e) {
      // audio not available, fail silently
    }
  }, []);

  const stopSession = useCallback(
    (didFinish) => {
      setRunning(false);
      clearInterval(intervalRef.current);
      if (didFinish) {
        setFinished(true);
        playChime();
        recordToday(targetSets);
      }
    },
    [playChime, recordToday, targetSets]
  );

  const advancePhase = useCallback(() => {
    setPhaseIndex((prevIdx) => {
      const nextIdx = (prevIdx + 1) % PHASES.length;
      if (nextIdx === 0) {
        setCycles((c) => {
          const newCount = c + 1;
          if (newCount >= targetSets) {
            setTimeout(() => stopSession(true), 0);
          }
          return newCount;
        });
      }
      setSecondsLeft(PHASES[nextIdx].duration);
      return nextIdx;
    });
  }, [targetSets, stopSession]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          advancePhase();
          if (soundOn) playTick(true);
          return PHASES[(phaseIndex + 1) % PHASES.length].duration;
        }
        if (soundOn) playTick(false);
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, phaseIndex, advancePhase, soundOn, playTick]);

  const toggleRunning = () => {
    unlockAudio();
    if (!running) {
      setPhaseIndex(0);
      setSecondsLeft(PHASES[0].duration);
      setCycles(0);
      setFinished(false);
    }
    setRunning((r) => !r);
  };

  const reset = () => {
    setRunning(false);
    setPhaseIndex(0);
    setSecondsLeft(PHASES[0].duration);
    setCycles(0);
    setFinished(false);
  };

  const phase = PHASES[phaseIndex];

  const BOX_CORNERS = [
    { x: 20, y: 240 },
    { x: 20, y: 20 },
    { x: 240, y: 20 },
    { x: 240, y: 240 },
  ];
  const ballTarget = running
    ? BOX_CORNERS[(phaseIndex + 1) % 4]
    : BOX_CORNERS[phaseIndex];

  const totalSeconds = targetSets * 16;
  const minutesLabel =
    totalSeconds % 60 === 0
      ? `約${totalSeconds / 60}分`
      : `約${Math.round(totalSeconds / 60)}分`;

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background:
          "radial-gradient(ellipse at 50% 20%, #232d4d 0%, #161c34 45%, #0e1224 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
        color: "#f3ece0",
        padding: "24px",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(1px 1px at 20% 30%, rgba(243,236,224,0.5) 0%, transparent 60%)," +
            "radial-gradient(1px 1px at 70% 15%, rgba(243,236,224,0.4) 0%, transparent 60%)," +
            "radial-gradient(1.5px 1.5px at 85% 60%, rgba(243,236,224,0.35) 0%, transparent 60%)," +
            "radial-gradient(1px 1px at 35% 75%, rgba(243,236,224,0.3) 0%, transparent 60%)," +
            "radial-gradient(1px 1px at 55% 45%, rgba(243,236,224,0.25) 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          fontSize: "13px",
          letterSpacing: "0.25em",
          color: "#a9b6d6",
          marginBottom: "8px",
          textTransform: "uppercase",
        }}
      >
        Box Breathing
      </div>
      <div
        style={{
          fontSize: "15px",
          color: "#c9a876",
          marginBottom: "20px",
          letterSpacing: "0.05em",
        }}
      >
        4 秒 吸う ・ 4 秒 止める ・ 4 秒 吐く ・ 4 秒 止める
      </div>

      <button
        onClick={() => {
          unlockAudio();
          setSoundOn((v) => !v);
        }}
        style={{
          padding: "5px 14px",
          fontSize: "11px",
          fontFamily: "inherit",
          letterSpacing: "0.05em",
          color: soundOn ? "#161c34" : "#c9d0e6",
          background: soundOn ? "#c9a876" : "rgba(201,208,230,0.08)",
          border: soundOn ? "1px solid #c9a876" : "1px solid rgba(201,208,230,0.25)",
          borderRadius: "999px",
          cursor: "pointer",
          marginBottom: "28px",
        }}
      >
        {soundOn ? "🔊 カウント音 ON" : "🔇 カウント音 OFF"}
      </button>

      {!running && !finished && (
        <div
          style={{
            fontSize: "13px",
            color: "#a9b6d6",
            marginBottom: "28px",
            letterSpacing: "0.05em",
          }}
        >
          {targetSets}セット・{minutesLabel}
        </div>
      )}

      <div
        style={{
          position: "relative",
          width: "260px",
          height: "260px",
          marginBottom: "40px",
        }}
      >
        <svg width="260" height="260" style={{ position: "absolute", top: 0, left: 0 }}>
          <rect
            x="20"
            y="20"
            width="220"
            height="220"
            rx="18"
            fill="none"
            stroke="rgba(169,182,214,0.22)"
            strokeWidth="1.5"
          />
          <line
            x1="20" y1="240" x2="20" y2="20"
            stroke={running && phase.key === "inhale" ? "#c9a876" : "transparent"}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1="20" y1="20" x2="240" y2="20"
            stroke={running && phase.key === "hold1" ? "#c9a876" : "transparent"}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1="240" y1="20" x2="240" y2="240"
            stroke={running && phase.key === "exhale" ? "#c9a876" : "transparent"}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1="240" y1="240" x2="20" y2="240"
            stroke={running && phase.key === "hold2" ? "#c9a876" : "transparent"}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>

        <div
          style={{
            position: "absolute",
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 35% 30%, #f2ede3 0%, #c9a876 45%, #7d9dc9 100%)",
            boxShadow: running
              ? "0 0 18px rgba(201,168,118,0.7), 0 0 34px rgba(125,157,201,0.4)"
              : "0 0 10px rgba(201,168,118,0.3)",
            left: `${ballTarget.x - 11}px`,
            top: `${ballTarget.y - 11}px`,
            transition: `left ${running ? 4 : 0}s linear, top ${running ? 4 : 0}s linear`,
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {finished ? (
            <>
              <div style={{ fontSize: "20px", fontWeight: 600, color: "#f2ede3" }}>
                完了
              </div>
              <div style={{ fontSize: "13px", color: "#c9a876" }}>Complete</div>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 600,
                  color: "#f2ede3",
                  letterSpacing: "0.05em",
                }}
              >
                {running ? phase.label : "準備"}
              </div>
              <div style={{ fontSize: "13px", color: "#a9b6d6", letterSpacing: "0.1em" }}>
                {running ? phase.sub : "Ready"}
              </div>
              {running && (
                <div style={{ fontSize: "34px", fontWeight: 300, color: "#f2ede3", marginTop: "4px" }}>
                  {secondsLeft}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
        <button
          onClick={toggleRunning}
          style={{
            padding: "12px 32px",
            fontSize: "15px",
            fontFamily: "inherit",
            letterSpacing: "0.08em",
            color: "#161c34",
            background: "#f2ede3",
            border: "none",
            borderRadius: "999px",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          {running ? "止める" : finished ? "もう一度" : "はじめる"}
        </button>
        <button
          onClick={reset}
          style={{
            padding: "12px 24px",
            fontSize: "15px",
            fontFamily: "inherit",
            letterSpacing: "0.08em",
            color: "#c9d0e6",
            background: "transparent",
            border: "1px solid rgba(201,208,230,0.35)",
            borderRadius: "999px",
            cursor: "pointer",
          }}
        >
          リセット
        </button>
      </div>

      <div style={{ fontSize: "13px", color: "#7d8bb0", letterSpacing: "0.05em", marginBottom: "18px" }}>
        {cycles} / {targetSets} セット
      </div>

      <button
        onClick={() => setShowHistory((s) => !s)}
        style={{
          padding: "6px 16px",
          fontSize: "12px",
          fontFamily: "inherit",
          letterSpacing: "0.08em",
          color: "#7d8bb0",
          background: "transparent",
          border: "1px solid rgba(125,139,176,0.35)",
          borderRadius: "999px",
          cursor: "pointer",
        }}
      >
        {showHistory ? "履歴を隠す" : "履歴を見る"}
      </button>

      {showHistory && (
        <div
          style={{
            marginTop: "18px",
            width: "100%",
            maxWidth: "420px",
            padding: "16px 20px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: "16px",
            border: "1px solid rgba(201,208,230,0.15)",
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px", justifyContent: "center" }}>
            {[7, 30, 90, "all"].map((n) => (
              <button
                key={n}
                onClick={() => setHistoryRange(n)}
                style={{
                  padding: "5px 14px",
                  fontSize: "11px",
                  fontFamily: "inherit",
                  letterSpacing: "0.05em",
                  color: historyRange === n ? "#161c34" : "#c9d0e6",
                  background: historyRange === n ? "#c9a876" : "rgba(201,208,230,0.08)",
                  border: historyRange === n ? "1px solid #c9a876" : "1px solid rgba(201,208,230,0.25)",
                  borderRadius: "999px",
                  cursor: "pointer",
                }}
              >
                {n === "all" ? "全期間" : `${n}日`}
              </button>
            ))}
          </div>

          {!historyLoaded ? (
            <div style={{ fontSize: "12px", color: "#7d8bb0", textAlign: "center" }}>読み込み中…</div>
          ) : (
            <>
              <div
                style={{
                  fontSize: "12px",
                  color: "#a9b6d6",
                  textAlign: "center",
                  marginBottom: "12px",
                }}
              >
                {getHistoryDays(history, historyRange).filter((d) => !!history[d.key]).length} / {getHistoryDays(history, historyRange).length} 日 達成
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: historyRange === 7 ? "10px" : "5px",
                  justifyContent: "center",
                  maxHeight: historyRange === "all" ? "220px" : "none",
                  overflowY: historyRange === "all" ? "auto" : "visible",
                }}
              >
                {getHistoryDays(history, historyRange).map((d) => {
                  const done = !!history[d.key];
                  const isToday = d.key === todayKey();
                  const size = historyRange === 7 ? 26 : historyRange === 30 ? 16 : 9;
                  return (
                    <div
                      key={d.key}
                      title={`${d.dateLabel}${done ? " ・完了" : ""}`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      {historyRange === 7 && (
                        <div style={{ fontSize: "11px", color: isToday ? "#c9a876" : "#7d8bb0" }}>
                          {d.label}
                        </div>
                      )}
                      <div
                        style={{
                          width: `${size}px`,
                          height: `${size}px`,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: historyRange === 7 ? "13px" : "0px",
                          background: done
                            ? "radial-gradient(circle at 35% 30%, #f2ede3 0%, #c9a876 60%, #7d9dc9 100%)"
                            : "rgba(255,255,255,0.06)",
                          border: isToday
                            ? "1px solid #c9a876"
                            : "1px solid rgba(201,208,230,0.2)",
                          color: "#161c34",
                        }}
                      >
                        {historyRange === 7 && done ? "✓" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
