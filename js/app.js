(function () {
  "use strict";

  // ---------- UTIL ----------

  function todayKey(d) {
    d = d || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function tomorrowKey() {
    var d = new Date();
    d.setDate(d.getDate() + 1);
    return todayKey(d);
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // storage unavailable — fail silently, nothing to persist
    }
  }

  function showToast(msg) {
    var toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.remove("hidden");
    setTimeout(function () {
      toast.classList.add("hidden");
    }, 1800);
  }

  function uid(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  }

  // ---------- CHANGE JOURNEY DAY ----------
  // Calendar days since the user's first day, +1. Never a streak: never
  // reset by a missed day, never dependent on habit completion.

  function ensureJourneyStarted() {
    if (!localStorage.getItem("nc_journey_start")) {
      localStorage.setItem("nc_journey_start", todayKey());
    }
  }

  function getJourneyDay() {
    var startKey = localStorage.getItem("nc_journey_start") || todayKey();
    var start = new Date(startKey + "T00:00:00");
    var now = new Date(todayKey() + "T00:00:00");
    var diffDays = Math.round((now - start) / 86400000);
    return Math.max(1, diffDays + 1);
  }

  function getLastNDateKeys(n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      out.push(todayKey(d));
    }
    return out;
  }

  // ---------- MOTIVATIONAL LINE ----------
  // One line, stable for the whole day (picked deterministically from the
  // date), not re-randomized on every render.

  var MOTIVATION_LINES = [
    "Today's small step still counts.",
    "Progress starts with what you do next.",
    "One focused action can change your day.",
    "Improve a little. Repeat it tomorrow.",
    "You don't need a perfect day, just one honest step."
  ];

  function getTodaysMotivationLine() {
    var key = todayKey();
    var seed = 0;
    for (var i = 0; i < key.length; i++) seed += key.charCodeAt(i);
    return MOTIVATION_LINES[seed % MOTIVATION_LINES.length];
  }

  // ---------- PRAYER TIMES ----------
  // Powers the Salah Consistency priority. Times come from Aladhan
  // (api.aladhan.com), a free, keyless, widely-used prayer-times API —
  // same "legitimate public API, no secret keys in client code" pattern
  // already used for Quran translations and ruku numbers. Never hard-coded
  // to one city: either the user's coordinates (with consent) or a
  // manually entered city/country, both re-fetched per local day.

  var PRAYER_ORDER = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  var PRAYER_METHODS = [
    { id: 1, label: "Karachi (Hanafi)" },
    { id: 3, label: "Muslim World League" },
    { id: 2, label: "ISNA" },
    { id: 4, label: "Umm al-Qura" },
    { id: 5, label: "Egyptian" },
    { id: 11, label: "Singapore" }
  ];

  function getPrayerSettings() {
    return readJSON("nc_prayer_settings", null);
  }

  function savePrayerSettings(s) {
    writeJSON("nc_prayer_settings", s);
  }

  function cleanTimeStr(t) {
    return (t || "").split(" ")[0];
  }

  function fetchPrayerTimesForToday(forceRefresh) {
    var settings = getPrayerSettings();
    if (!settings) return Promise.reject(new Error("no prayer settings"));
    var sig = settings.mode === "auto"
      ? (settings.lat.toFixed(2) + "," + settings.lon.toFixed(2) + ",m" + settings.method)
      : (settings.city + "," + settings.country + ",m" + settings.method);
    var cache = readJSON("nc_prayer_times_cache", null);
    if (!forceRefresh && cache && cache.date === todayKey() && cache.signature === sig) {
      return Promise.resolve(cache.timings);
    }
    var url = settings.mode === "auto"
      ? "https://api.aladhan.com/v1/timings?latitude=" + settings.lat + "&longitude=" + settings.lon + "&method=" + settings.method
      : "https://api.aladhan.com/v1/timingsByCity?city=" + encodeURIComponent(settings.city) + "&country=" + encodeURIComponent(settings.country) + "&method=" + settings.method;
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("prayer times fetch failed");
      return res.json();
    }).then(function (data) {
      var t = data.data.timings;
      var timings = {
        Fajr: cleanTimeStr(t.Fajr), Dhuhr: cleanTimeStr(t.Dhuhr), Asr: cleanTimeStr(t.Asr),
        Maghrib: cleanTimeStr(t.Maghrib), Isha: cleanTimeStr(t.Isha)
      };
      writeJSON("nc_prayer_times_cache", { date: todayKey(), signature: sig, timings: timings });
      return timings;
    });
  }

  function parseTimeToday(hhmm, dayOffset) {
    var parts = hhmm.split(":");
    var d = new Date();
    if (dayOffset) d.setDate(d.getDate() + dayOffset);
    d.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
    return d;
  }

  function getNextPrayer(timings) {
    var now = new Date();
    for (var i = 0; i < PRAYER_ORDER.length; i++) {
      var name = PRAYER_ORDER[i];
      var t = parseTimeToday(timings[name]);
      if (t > now) return { name: name, time: t };
    }
    return { name: "Fajr", time: parseTimeToday(timings.Fajr, 1), tomorrow: true };
  }

  function getSalahCompletions() {
    var all = readJSON("nc_salah_completions", {});
    return all[todayKey()] || {};
  }

  function setSalahComplete(name) {
    var all = readJSON("nc_salah_completions", {});
    var today = todayKey();
    all[today] = all[today] || {};
    all[today][name] = true;
    writeJSON("nc_salah_completions", all);
  }

  function requestLocationForPrayerTimes() {
    if (!navigator.geolocation) {
      showToast("Location isn't available on this device — use manual setup instead");
      return;
    }
    showToast("Getting your location…");
    navigator.geolocation.getCurrentPosition(function (pos) {
      savePrayerSettings({ mode: "auto", lat: pos.coords.latitude, lon: pos.coords.longitude, method: 1 });
      renderHome();
    }, function () {
      showToast("Location permission denied — use manual setup instead");
    }, { timeout: 10000 });
  }

  // ---------- FITNESS CONTENT ----------
  // Original, beginner-friendly warm-up + workout suggestions per body
  // part — generic exercise names, not copied from any specific program.

  var FITNESS_BODY_PARTS = [
    { key: "full", label: "Full Body", warmup: ["Arm circles", "Bodyweight squats x10", "Torso twists", "Jumping jacks x15"], workout: ["Squats", "Push-ups", "Plank hold", "Lunges", "Mountain climbers"] },
    { key: "chest", label: "Chest", warmup: ["Arm circles", "Shoulder rotations", "Wall chest stretch", "Light push-ups x5"], workout: ["Push-ups", "Incline push-ups", "Chest squeeze hold", "Wide push-ups"] },
    { key: "back", label: "Back", warmup: ["Cat-cow stretch", "Shoulder rolls", "Standing back extension", "Arm swings"], workout: ["Superman hold", "Reverse snow angels", "Door-frame rows", "Bird-dog"] },
    { key: "legs", label: "Legs", warmup: ["Leg swings", "Bodyweight squats x10", "Ankle circles", "Hip circles"], workout: ["Squats", "Lunges", "Calf raises", "Wall sit"] },
    { key: "shoulders", label: "Shoulders", warmup: ["Arm circles", "Shoulder rolls", "Cross-body arm stretch", "Neck tilts"], workout: ["Pike push-ups", "Arm raises", "Shoulder taps", "Plank shoulder circles"] },
    { key: "arms", label: "Arms", warmup: ["Arm circles", "Wrist rotations", "Triceps stretch", "Light push-ups x5"], workout: ["Push-ups", "Triceps dips (chair)", "Diamond push-ups", "Arm pulses"] },
    { key: "core", label: "Core", warmup: ["Torso twists", "Cat-cow stretch", "Standing side bends", "Hip circles"], workout: ["Plank hold", "Bicycle crunches", "Leg raises", "Side plank"] },
    { key: "mobility", label: "Mobility", warmup: ["Neck tilts", "Shoulder rolls", "Hip circles", "Ankle circles"], workout: ["Deep squat hold", "World's greatest stretch", "Cat-cow flow", "Standing forward fold"] },
    { key: "stretch", label: "Stretching", warmup: [], workout: ["Standing forward fold", "Quad stretch", "Hamstring stretch", "Child's pose", "Chest opener stretch"] }
  ];

  // ---------- TODAY'S PRIORITY ----------
  // Core loop: CHOOSE (one priority) -> DO (Start Now) -> TRACK -> REVIEW
  // (next-day accountability, realistic adjustment) -> REPEAT. No streaks,
  // no reset-mode, no multi-item checklist.

  var PRESET_PLANS = [
    { key: "study", label: "Study Focus", kind: "study", why: "You chose Study Focus as what matters most today.", actionTitle: null, minutes: null },
    { key: "sleep", label: "Better Sleep", kind: "sleep", why: "You chose Better Sleep as what matters most today.", actionTitle: null, minutes: null },
    { key: "phone", label: "Reduce Phone Use", kind: "phone", why: "You chose Reduce Phone Use as what matters most today.", actionTitle: null, minutes: null },
    { key: "salah", label: "Salah Consistency", kind: "salah", why: "You chose Salah Consistency as what matters most today.", actionTitle: "Stay on top of today's prayers", minutes: null },
    { key: "fitness", label: "Fitness Basics", kind: "fitness", why: "You chose Fitness Basics as what matters most today.", actionTitle: null, minutes: null },
    { key: "morning", label: "Morning Routine", kind: null, why: "You chose Morning Routine as what matters most today.", actionTitle: "Do your full morning routine", minutes: 15 }
  ];

  var PHONE_DISTRACTIONS = ["Instagram / Reels", "YouTube", "Gaming", "Messaging", "Browsing", "General scrolling", "Other"];
  var PHONE_REPLACEMENTS = ["Study", "Walk", "Exercise", "Read Quran", "Read a book", "Complete a task", "Rest"];
  var STUDY_PREP_ITEMS = ["Turn on Do Not Disturb / Focus Mode", "Put distracting apps away", "Keep only your study material ready", "Choose what you are studying"];
  var SLEEP_PREP_ITEMS = ["Put phone on charge away from bed", "Dim the lights", "Brush / wash / make wudu", "Stop scrolling", "Prepare the room", "Set morning alarm"];

  var pendingAdjustmentNote = null;
  var focusPrepShownForPriorityId = null;
  var focusPrepPendingStart = false;

  function parseMinutesFromTitle(title) {
    var m = title.match(/(\d+)\s*min/i);
    return m ? Number(m[1]) : null;
  }

  function getCurrentPriority() {
    return readJSON("nc_priority_current", null);
  }

  function savePriority(p) {
    writeJSON("nc_priority_current", p);
  }

  function appendPriorityLog(entry) {
    var log = readJSON("nc_priority_log", []);
    log.push(entry);
    writeJSON("nc_priority_log", log);
  }

  function setTodaysPriority(planKey, customTitle) {
    var plan = planKey ? PRESET_PLANS.find(function (pl) { return pl.key === planKey; }) : null;
    var p;
    if (plan) {
      p = { id: uid("pri"), planKey: plan.key, kind: plan.kind, title: plan.actionTitle, why: plan.why, minutes: plan.minutes, date: todayKey(), status: "pending" };
    } else {
      var title = customTitle.trim();
      p = { id: uid("pri"), planKey: null, kind: null, title: title, why: "You chose this as what matters most today.", minutes: parseMinutesFromTitle(title), date: todayKey(), status: "pending" };
    }
    savePriority(p);
    focusState.linkedPriorityId = null;
    focusPrepShownForPriorityId = null;
    return p;
  }

  function setTodaysStudyPriority(minutes) {
    var plan = PRESET_PLANS.find(function (pl) { return pl.key === "study"; });
    var p = { id: uid("pri"), planKey: "study", kind: "study", title: "Study Focus — " + minutes + " minutes", why: plan.why, minutes: minutes, date: todayKey(), status: "pending" };
    savePriority(p);
    focusState.linkedPriorityId = null;
    focusPrepShownForPriorityId = null;
    return p;
  }

  function setTodaysFitnessPriority(bodyPartKey, minutes) {
    var bp = FITNESS_BODY_PARTS.find(function (b) { return b.key === bodyPartKey; });
    var plan = PRESET_PLANS.find(function (pl) { return pl.key === "fitness"; });
    var p = { id: uid("pri"), planKey: "fitness", kind: "fitness", title: "Fitness Basics — " + bp.label, why: plan.why, minutes: minutes, bodyPart: bodyPartKey, warmupDone: false, date: todayKey(), status: "pending" };
    savePriority(p);
    focusState.linkedPriorityId = null;
    focusPrepShownForPriorityId = null;
    return p;
  }

  function setTodaysPhonePriority(distraction, minutes, replacement) {
    var plan = PRESET_PLANS.find(function (pl) { return pl.key === "phone"; });
    var p = { id: uid("pri"), planKey: "phone", kind: "phone", title: "Phone-Free Session — " + replacement, why: plan.why, minutes: minutes, distraction: distraction, replacement: replacement, date: todayKey(), status: "pending" };
    savePriority(p);
    focusState.linkedPriorityId = null;
    focusPrepShownForPriorityId = null;
    return p;
  }

  function setTodaysSleepPriority(bedtime) {
    var plan = PRESET_PLANS.find(function (pl) { return pl.key === "sleep"; });
    var p = {
      id: uid("pri"), planKey: "sleep", kind: "sleep", title: "Better Sleep — target " + bedtime, why: plan.why,
      minutes: null, targetBedtime: bedtime, sleepStart: new Date().toISOString(), wakeTime: null,
      date: todayKey(), status: "pending"
    };
    savePriority(p);
    focusState.linkedPriorityId = null;
    focusPrepShownForPriorityId = null;
    return p;
  }

  function setTodaysSalahPriority() {
    var plan = PRESET_PLANS.find(function (pl) { return pl.key === "salah"; });
    var p = { id: uid("pri"), planKey: "salah", kind: "salah", title: "Salah Consistency", why: plan.why, minutes: null, date: todayKey(), status: "pending" };
    savePriority(p);
    focusState.linkedPriorityId = null;
    focusPrepShownForPriorityId = null;
    return p;
  }

  function markPriorityStatusToday(status) {
    var p = getCurrentPriority();
    if (!p) return;
    p.status = status;
    savePriority(p);
  }

  function submitAccountability(status) {
    var p = getCurrentPriority();
    if (!p) return;
    appendPriorityLog({ date: p.date, planKey: p.planKey, title: p.title, minutes: p.minutes, status: status });

    if (status === "partial" && p.minutes) {
      var half = Math.max(5, Math.round(p.minutes / 2));
      var newTitle = p.title.replace(/\d+\s*min(ute)?s?/i, half + " min");
      savePriority({ id: uid("pri"), planKey: p.planKey, title: newTitle, why: "Adjusted from yesterday — a smaller target, same goal.", minutes: half, date: todayKey(), status: "pending" });
      showToast("Yesterday's target was " + p.minutes + " min. Today's: " + half + " min.");
    } else if (status === "not-yet" && p.minutes) {
      var smaller = Math.max(5, Math.round(p.minutes * 0.7));
      var newTitle2 = p.title.replace(/\d+\s*min(ute)?s?/i, smaller + " min");
      savePriority({ id: uid("pri"), planKey: p.planKey, title: newTitle2, why: "Let's try again with a smaller, doable target.", minutes: smaller, date: todayKey(), status: "pending" });
      showToast("No worries — today's target: " + smaller + " min.");
    } else {
      savePriority(null);
      pendingAdjustmentNote = status === "completed" ? "Nice — you finished it. Pick today's priority." : "Pick today's priority.";
    }
    focusState.linkedPriorityId = null;
    pickerStep = { view: "main", bodyPart: null };
    renderHome();
  }

  function chooseDifferentPriority() {
    var p = getCurrentPriority();
    if (p) {
      appendPriorityLog({ date: p.date, planKey: p.planKey, title: p.title, minutes: p.minutes, status: p.status === "pending" ? "not-yet" : p.status });
      savePriority(null);
    }
    focusState.linkedPriorityId = null;
    pickerStep = { view: "main", bodyPart: null };
    stopFocus();
    stopSalahCountdown();
    renderHome();
  }

  // ---------- PICKER STEPS (multi-step selection for Study/Fitness/Salah) ----------

  var pickerStep = { view: "main", bodyPart: null };

  function buildChecklist(items) {
    var list = document.createElement("div");
    list.className = "checklist";
    items.forEach(function (text, idx) {
      var label = document.createElement("label");
      label.className = "checklist-item";
      var input = document.createElement("input");
      input.type = "checkbox";
      var span = document.createElement("span");
      span.textContent = text;
      label.appendChild(input);
      label.appendChild(span);
      list.appendChild(label);
    });
    return list;
  }

  function buildDurationChipPicker(options, onPick) {
    var wrap = document.createElement("div");
    wrap.className = "focus-duration-row";
    options.forEach(function (mins) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "duration-chip";
      chip.textContent = mins;
      chip.addEventListener("click", function () { onPick(mins); });
      wrap.appendChild(chip);
    });
    var input = document.createElement("input");
    input.type = "number";
    input.className = "duration-custom-input";
    input.placeholder = "Custom";
    input.min = "1";
    input.max = "180";
    wrap.appendChild(input);
    var setBtn = document.createElement("button");
    setBtn.type = "button";
    setBtn.className = "duration-chip";
    setBtn.textContent = "Set";
    setBtn.addEventListener("click", function () {
      var val = Math.round(Number(input.value));
      if (val > 0 && val <= 180) onPick(val);
      else showToast("Enter a number of minutes between 1 and 180");
    });
    wrap.appendChild(setBtn);
    return wrap;
  }

  function addStepBack(stepEl) {
    var back = document.createElement("button");
    back.type = "button";
    back.className = "picker-step-back";
    back.textContent = "← Back";
    back.addEventListener("click", function () { pickerStep = { view: "main", bodyPart: null }; renderPickerStep(); });
    stepEl.appendChild(back);
  }

  function renderPickerStep() {
    var mainEl = document.getElementById("priority-picker-main");
    var stepEl = document.getElementById("priority-picker-step");
    stepEl.innerHTML = "";

    if (pickerStep.view === "main") {
      mainEl.classList.remove("hidden");
      stepEl.classList.add("hidden");
      return;
    }
    mainEl.classList.add("hidden");
    stepEl.classList.remove("hidden");
    addStepBack(stepEl);

    if (pickerStep.view === "study-prep") {
      var pt = document.createElement("p");
      pt.className = "picker-step-title";
      pt.textContent = "Prepare to study";
      stepEl.appendChild(pt);
      stepEl.appendChild(buildChecklist(STUDY_PREP_ITEMS));
      var contBtn = document.createElement("button");
      contBtn.type = "button";
      contBtn.className = "btn btn-primary btn-full";
      contBtn.textContent = "Continue";
      contBtn.addEventListener("click", function () {
        pickerStep = { view: "study-duration", bodyPart: null };
        renderPickerStep();
      });
      stepEl.appendChild(contBtn);
    } else if (pickerStep.view === "study-duration") {
      var t1 = document.createElement("p");
      t1.className = "picker-step-title";
      t1.textContent = "How long do you want to study?";
      stepEl.appendChild(t1);
      stepEl.appendChild(buildDurationChipPicker([15, 25, 30, 45, 60], function (mins) {
        setTodaysStudyPriority(mins);
        pendingAdjustmentNote = null;
        pickerStep = { view: "main", bodyPart: null };
        renderHome();
      }));
    } else if (pickerStep.view === "phone-distraction") {
      var pd = document.createElement("p");
      pd.className = "picker-step-title";
      pd.textContent = "What is distracting you right now?";
      stepEl.appendChild(pd);
      var pdGrid = document.createElement("div");
      pdGrid.className = "preset-plan-grid";
      PHONE_DISTRACTIONS.forEach(function (d) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "preset-plan-chip";
        btn.textContent = d;
        btn.addEventListener("click", function () {
          pickerStep = { view: "phone-steps", bodyPart: null, distraction: d };
          renderPickerStep();
        });
        pdGrid.appendChild(btn);
      });
      stepEl.appendChild(pdGrid);
      var pgEntry = document.createElement("button");
      pgEntry.type = "button";
      pgEntry.className = "btn btn-outline btn-full";
      pgEntry.style.marginTop = "14px";
      pgEntry.textContent = "Intentional Open — pause before distracting apps pull you in";
      pgEntry.addEventListener("click", function () { pgView = { screen: "main" }; setActiveView("duniya-phone-guard"); });
      stepEl.appendChild(pgEntry);
    } else if (pickerStep.view === "phone-steps") {
      var ps1 = document.createElement("p");
      ps1.className = "picker-step-title";
      ps1.textContent = "STEP 1 — Turn on Focus Mode / Do Not Disturb";
      stepEl.appendChild(ps1);
      var settingsBtn = document.createElement("button");
      settingsBtn.type = "button";
      settingsBtn.className = "btn btn-outline btn-full";
      settingsBtn.textContent = "Open Focus / Do Not Disturb Settings";
      settingsBtn.addEventListener("click", function () {
        showToast("Open your phone's Settings app → Sound / Focus → turn on Do Not Disturb");
      });
      stepEl.appendChild(settingsBtn);
      var ps2 = document.createElement("p");
      ps2.className = "picker-step-title";
      ps2.textContent = "STEP 2 — Close " + pickerStep.distraction;
      stepEl.appendChild(ps2);
      var contBtn2 = document.createElement("button");
      contBtn2.type = "button";
      contBtn2.className = "btn btn-primary btn-full";
      contBtn2.textContent = "Done — continue";
      contBtn2.addEventListener("click", function () {
        pickerStep = { view: "phone-duration", bodyPart: null, distraction: pickerStep.distraction };
        renderPickerStep();
      });
      stepEl.appendChild(contBtn2);
    } else if (pickerStep.view === "phone-duration") {
      var pdt = document.createElement("p");
      pdt.className = "picker-step-title";
      pdt.textContent = "STEP 3 — How long do you want to stay away?";
      stepEl.appendChild(pdt);
      var distraction = pickerStep.distraction;
      stepEl.appendChild(buildDurationChipPicker([10, 15, 30, 45, 60], function (mins) {
        pickerStep = { view: "phone-replacement", bodyPart: null, distraction: distraction, minutes: mins };
        renderPickerStep();
      }));
    } else if (pickerStep.view === "phone-replacement") {
      var prt = document.createElement("p");
      prt.className = "picker-step-title";
      prt.textContent = "STEP 4 — What will you do instead?";
      stepEl.appendChild(prt);
      var prGrid = document.createElement("div");
      prGrid.className = "preset-plan-grid";
      var stepMinutes = pickerStep.minutes;
      var stepDistraction = pickerStep.distraction;
      PHONE_REPLACEMENTS.forEach(function (r) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "preset-plan-chip";
        btn.textContent = r;
        btn.addEventListener("click", function () {
          setTodaysPhonePriority(stepDistraction, stepMinutes, r);
          pendingAdjustmentNote = null;
          pickerStep = { view: "main", bodyPart: null };
          renderHome();
        });
        prGrid.appendChild(btn);
      });
      stepEl.appendChild(prGrid);
      var customRow = document.createElement("div");
      customRow.className = "priority-custom-row";
      var customInput = document.createElement("input");
      customInput.type = "text";
      customInput.className = "text-input";
      customInput.placeholder = "Custom activity...";
      var customBtn = document.createElement("button");
      customBtn.type = "button";
      customBtn.className = "btn btn-primary";
      customBtn.textContent = "Set";
      customBtn.addEventListener("click", function () {
        var val = customInput.value.trim();
        if (!val) return;
        setTodaysPhonePriority(stepDistraction, stepMinutes, val);
        pendingAdjustmentNote = null;
        pickerStep = { view: "main", bodyPart: null };
        renderHome();
      });
      customRow.appendChild(customInput);
      customRow.appendChild(customBtn);
      stepEl.appendChild(customRow);
    } else if (pickerStep.view === "sleep-bedtime") {
      var sbt = document.createElement("p");
      sbt.className = "picker-step-title";
      sbt.textContent = "What time do you want to sleep?";
      stepEl.appendChild(sbt);
      var timeInput = document.createElement("input");
      timeInput.type = "time";
      timeInput.className = "text-input";
      timeInput.id = "sleep-bedtime-input";
      stepEl.appendChild(timeInput);
      var nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "btn btn-primary btn-full";
      nextBtn.textContent = "Continue";
      nextBtn.addEventListener("click", function () {
        var val = timeInput.value;
        if (!val) { showToast("Pick a bedtime first"); return; }
        pickerStep = { view: "sleep-prep", bodyPart: null, bedtime: val };
        renderPickerStep();
      });
      stepEl.appendChild(nextBtn);
    } else if (pickerStep.view === "sleep-prep") {
      var spt = document.createElement("p");
      spt.className = "picker-step-title";
      spt.textContent = "30 minutes before bed";
      stepEl.appendChild(spt);
      stepEl.appendChild(buildChecklist(SLEEP_PREP_ITEMS));
      var bedtime = pickerStep.bedtime;
      var sleepBtn = document.createElement("button");
      sleepBtn.type = "button";
      sleepBtn.className = "btn btn-primary btn-full";
      sleepBtn.textContent = "I'M GOING TO SLEEP";
      sleepBtn.addEventListener("click", function () {
        setTodaysSleepPriority(bedtime);
        pendingAdjustmentNote = null;
        pickerStep = { view: "main", bodyPart: null };
        renderHome();
      });
      stepEl.appendChild(sleepBtn);
    } else if (pickerStep.view === "fitness-bodypart") {
      var t2 = document.createElement("p");
      t2.className = "picker-step-title";
      t2.textContent = "What are you training today?";
      stepEl.appendChild(t2);
      var grid = document.createElement("div");
      grid.className = "preset-plan-grid";
      FITNESS_BODY_PARTS.forEach(function (bp) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "preset-plan-chip";
        btn.textContent = bp.label;
        btn.addEventListener("click", function () {
          pickerStep = { view: "fitness-duration", bodyPart: bp.key };
          renderPickerStep();
        });
        grid.appendChild(btn);
      });
      stepEl.appendChild(grid);
    } else if (pickerStep.view === "fitness-duration") {
      var t3 = document.createElement("p");
      t3.className = "picker-step-title";
      t3.textContent = "How much time do you have?";
      stepEl.appendChild(t3);
      stepEl.appendChild(buildDurationChipPicker([5, 10, 20, 30, 45], function (mins) {
        setTodaysFitnessPriority(pickerStep.bodyPart, mins);
        pendingAdjustmentNote = null;
        pickerStep = { view: "main", bodyPart: null };
        renderHome();
      }));
    } else if (pickerStep.view === "salah-setup") {
      var text = document.createElement("p");
      text.className = "salah-setup-text";
      text.textContent = "NURA uses your location only to calculate local prayer times.";
      stepEl.appendChild(text);
      var allowBtn = document.createElement("button");
      allowBtn.type = "button";
      allowBtn.className = "btn btn-primary btn-full";
      allowBtn.textContent = "Allow Location";
      allowBtn.addEventListener("click", function () {
        if (!navigator.geolocation) { showToast("Location isn't available on this device — use manual setup instead"); return; }
        showToast("Getting your location…");
        navigator.geolocation.getCurrentPosition(function (pos) {
          savePrayerSettings({ mode: "auto", lat: pos.coords.latitude, lon: pos.coords.longitude, method: 1 });
          setTodaysSalahPriority();
          pendingAdjustmentNote = null;
          pickerStep = { view: "main", bodyPart: null };
          renderHome();
        }, function () {
          showToast("Location permission denied — use manual setup instead");
        }, { timeout: 10000 });
      });
      stepEl.appendChild(allowBtn);
      var manualBtn = document.createElement("button");
      manualBtn.type = "button";
      manualBtn.className = "btn btn-outline btn-full";
      manualBtn.textContent = "Enter city manually";
      manualBtn.addEventListener("click", function () {
        pickerStep = { view: "salah-manual", bodyPart: null };
        renderPickerStep();
      });
      stepEl.appendChild(manualBtn);
    } else if (pickerStep.view === "salah-manual") {
      var cityInput = document.createElement("input");
      cityInput.type = "text";
      cityInput.className = "text-input";
      cityInput.placeholder = "City";
      var countryInput = document.createElement("input");
      countryInput.type = "text";
      countryInput.className = "text-input";
      countryInput.placeholder = "Country";
      var methodSelect = document.createElement("select");
      methodSelect.className = "text-input";
      PRAYER_METHODS.forEach(function (m) {
        var opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.label;
        methodSelect.appendChild(opt);
      });
      var saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn btn-primary btn-full";
      saveBtn.textContent = "Save and continue";
      saveBtn.addEventListener("click", function () {
        var city = cityInput.value.trim();
        var country = countryInput.value.trim();
        if (!city || !country) { showToast("Enter both city and country"); return; }
        savePrayerSettings({ mode: "manual", city: city, country: country, method: Number(methodSelect.value) });
        setTodaysSalahPriority();
        pendingAdjustmentNote = null;
        pickerStep = { view: "main", bodyPart: null };
        renderHome();
      });
      stepEl.appendChild(cityInput);
      stepEl.appendChild(countryInput);
      stepEl.appendChild(methodSelect);
      stepEl.appendChild(saveBtn);
    }
  }

  function renderPresetPicker() {
    var grid = document.getElementById("preset-plan-grid");
    grid.innerHTML = "";
    PRESET_PLANS.forEach(function (plan) {
      var btn = document.createElement("button");
      btn.className = "preset-plan-chip";
      btn.textContent = plan.label;
      btn.addEventListener("click", function () {
        if (plan.key === "study") {
          pickerStep = { view: "study-prep", bodyPart: null };
          renderPickerStep();
        } else if (plan.key === "phone") {
          pickerStep = { view: "phone-distraction", bodyPart: null };
          renderPickerStep();
        } else if (plan.key === "sleep") {
          pickerStep = { view: "sleep-bedtime", bodyPart: null };
          renderPickerStep();
        } else if (plan.key === "fitness") {
          pickerStep = { view: "fitness-bodypart", bodyPart: null };
          renderPickerStep();
        } else if (plan.key === "salah") {
          if (getPrayerSettings()) {
            setTodaysSalahPriority();
            pendingAdjustmentNote = null;
            renderHome();
          } else {
            pickerStep = { view: "salah-setup", bodyPart: null };
            renderPickerStep();
          }
        } else {
          setTodaysPriority(plan.key, null);
          pendingAdjustmentNote = null;
          renderHome();
        }
      });
      grid.appendChild(btn);
    });
    var note = document.getElementById("priority-adjustment-note");
    if (pendingAdjustmentNote) {
      note.textContent = pendingAdjustmentNote;
      note.classList.remove("hidden");
    } else {
      note.classList.add("hidden");
    }
    renderPickerStep();
  }

  // ---------- TODAY'S PROGRESS RING ----------

  function computeProgressPercent(p) {
    if (!p || p.status !== "pending") return p ? 100 : 0;
    if (p.kind === "salah") {
      var completions = getSalahCompletions();
      var doneCount = PRAYER_ORDER.filter(function (n) { return completions[n]; }).length;
      return Math.round((doneCount / PRAYER_ORDER.length) * 100);
    }
    if (p.kind === "sleep") {
      if (!p.sleepStart) return 0;
      var elapsedHrs = (new Date() - new Date(p.sleepStart)) / 3600000;
      return Math.min(100, Math.max(0, Math.round((elapsedHrs / 8) * 100)));
    }
    if (focusState.linkedPriorityId === p.id && p.minutes && (p.kind !== "fitness" || p.warmupDone)) {
      var total = focusSecondsTotal();
      var elapsed = total - focusState.remaining;
      return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
    }
    return 0;
  }

  function renderProgressRing(p) {
    var pct = computeProgressPercent(p);
    var circumference = 213.6;
    document.getElementById("progress-ring-fill").style.strokeDashoffset = circumference * (1 - pct / 100);
    document.getElementById("progress-ring-percent").textContent = pct + "%";
  }

  // ---------- 7-DAY PROGRESS GRAPH (real data only) ----------

  function getDayProgressPercent(dateKey) {
    if (dateKey === todayKey()) {
      return computeProgressPercent(getCurrentPriority());
    }
    var log = readJSON("nc_priority_log", []);
    var entries = log.filter(function (e) { return e.date === dateKey; });
    if (!entries.length) return null;
    var last = entries[entries.length - 1];
    if (last.status === "completed") return 100;
    if (last.status === "partial") return 50;
    return 0;
  }

  function renderProgressGraph() {
    var container = document.getElementById("progress-graph-container");
    var anyData = readJSON("nc_priority_log", []).length > 0 || !!getCurrentPriority();
    container.innerHTML = "";

    if (!anyData) {
      var empty = document.createElement("p");
      empty.className = "progress-graph-empty";
      empty.textContent = "Complete your first action to start your progress graph.";
      container.appendChild(empty);
      return;
    }

    var row = document.createElement("div");
    row.className = "progress-graph-row";
    var today = todayKey();
    getLastNDateKeys(7).slice().reverse().forEach(function (dateKey) {
      var pct = getDayProgressPercent(dateKey);
      var wrap = document.createElement("div");
      wrap.className = "progress-graph-bar-wrap";
      var bar = document.createElement("div");
      bar.className = "progress-graph-bar" + (pct !== null ? " has-data" : "") + (dateKey === today ? " is-today" : "");
      bar.style.height = Math.max(4, (pct || 0) * 0.7) + "px";
      var label = document.createElement("span");
      label.className = "progress-graph-label";
      label.textContent = new Date(dateKey + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3);
      wrap.appendChild(bar);
      wrap.appendChild(label);
      row.appendChild(wrap);
    });
    row.addEventListener("click", openProgressDetails);
    container.appendChild(row);

    var hint = document.createElement("p");
    hint.className = "progress-tap-hint";
    hint.textContent = "Tap for details";
    container.appendChild(hint);
  }

  function openProgressDetails() {
    var todayEl = document.getElementById("progress-details-today");
    var p = getCurrentPriority();
    todayEl.innerHTML = "";
    var rows = [
      { label: "Completed actions", value: p && p.status !== "pending" ? "1" : "0" },
      { label: "Pending actions", value: p && p.status === "pending" ? "1" : "0" },
      { label: "Overall progress", value: computeProgressPercent(p) + "%" }
    ];
    rows.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "progress-detail-row";
      row.innerHTML = '<span class="progress-detail-label">' + r.label + '</span><span class="progress-detail-value">' + r.value + '</span>';
      todayEl.appendChild(row);
    });

    var weekEl = document.getElementById("progress-details-week");
    weekEl.innerHTML = "";
    var dates = getLastNDateKeys(7).slice().reverse();
    dates.forEach(function (dateKey) {
      var pct = getDayProgressPercent(dateKey);
      var row = document.createElement("div");
      row.className = "progress-detail-row";
      var label = new Date(dateKey + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      var value = pct === null ? "No activity" : pct + "%";
      row.innerHTML = '<span class="progress-detail-label">' + label + '</span><span class="progress-detail-value">' + value + '</span>';
      weekEl.appendChild(row);
    });

    rcProgressRows().forEach(function (r) {
      var row = document.createElement("div");
      row.className = "progress-detail-row";
      var l = document.createElement("span"); l.className = "progress-detail-label"; l.textContent = r.label;
      var v = document.createElement("span"); v.className = "progress-detail-value"; v.textContent = r.value;
      row.appendChild(l); row.appendChild(v);
      weekEl.appendChild(row);
    });

    if (pgNative()) {
      var pgStatsAll = pgStats();
      var pgWeek = pgSummarize(pgStatsAll, getLastNDateKeys(7));
      var pgPrev = pgSummarize(pgStatsAll, getLastNDateKeys(14).slice(7));
      if (pgWeek.hasData) {
        var pgRows = [
          { label: "Phone Control — watched apps (7 days)", value: pgFmtDur(pgWeek.ms) },
          { label: "Pauses / went back", value: pgWeek.pauses + " / " + pgWeek.wentBack }
        ];
        if (pgPrev.hasData) {
          var pgDiff = pgWeek.ms - pgPrev.ms;
          pgRows.push({ label: "vs. previous week", value: pgDiff === 0 ? "No change" : (pgDiff < 0 ? "↓ " : "↑ ") + pgFmtDur(Math.abs(pgDiff)) });
        }
        pgRows.forEach(function (r) {
          var row = document.createElement("div");
          row.className = "progress-detail-row";
          var l = document.createElement("span"); l.className = "progress-detail-label"; l.textContent = r.label;
          var v = document.createElement("span"); v.className = "progress-detail-value"; v.textContent = r.value;
          row.appendChild(l); row.appendChild(v);
          weekEl.appendChild(row);
        });
      }
    }

    document.getElementById("modal-progress-details").classList.remove("hidden");
  }

  function renderProgressLine(p) {
    var line = document.getElementById("progress-line");
    renderProgressRing(p);
    if (!p) { line.textContent = "Choose today's priority above to begin."; return; }
    if (p.kind === "salah") {
      var completions = getSalahCompletions();
      var doneCount = PRAYER_ORDER.filter(function (n) { return completions[n]; }).length;
      line.textContent = doneCount + " of 5 prayers marked complete today.";
      return;
    }
    if (p.kind === "sleep") {
      line.textContent = p.wakeTime ? "Sleep logged ✓" : "Asleep since " + new Date(p.sleepStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + ".";
      return;
    }
    if (p.status !== "pending") { line.textContent = "Completed today ✓"; return; }
    if (focusState.linkedPriorityId === p.id && focusState.running) { line.textContent = "In progress — timer running."; return; }
    if (focusState.linkedPriorityId === p.id && focusState.remaining !== focusSecondsTotal()) { line.textContent = "Paused — pick up when ready."; return; }
    line.textContent = "Not started yet.";
  }

  // ---------- SALAH VIEW ----------

  var salahCountdownIntervalId = null;

  function stopSalahCountdown() {
    if (salahCountdownIntervalId) { clearInterval(salahCountdownIntervalId); salahCountdownIntervalId = null; }
  }

  function startSalahCountdown(targetTime) {
    stopSalahCountdown();
    function tick() {
      var el = document.getElementById("salah-countdown-text");
      if (!el) { stopSalahCountdown(); return; }
      var diff = targetTime - new Date();
      if (diff <= 0) {
        stopSalahCountdown();
        renderHome();
        return;
      }
      var h = Math.floor(diff / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      el.textContent = String(h).padStart(2, "0") + "h " + String(m).padStart(2, "0") + "m " + String(s).padStart(2, "0") + "s";
    }
    tick();
    salahCountdownIntervalId = setInterval(tick, 1000);
  }

  function buildSalahCard(container, timings) {
    container.innerHTML = "";
    var next = getNextPrayer(timings);
    var completions = getSalahCompletions();

    var label = document.createElement("p");
    label.className = "salah-next-label";
    label.textContent = next.tomorrow ? "Next Salah (tomorrow)" : "Next Salah";
    container.appendChild(label);

    var name = document.createElement("p");
    name.className = "salah-next-name";
    name.textContent = next.name;
    container.appendChild(name);

    var clock = document.createElement("p");
    clock.className = "salah-next-clock";
    clock.textContent = next.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    container.appendChild(clock);

    var countdown = document.createElement("p");
    countdown.className = "salah-countdown";
    countdown.id = "salah-countdown-text";
    container.appendChild(countdown);

    var lastPassed = null;
    for (var i = PRAYER_ORDER.length - 1; i >= 0; i--) {
      if (parseTimeToday(timings[PRAYER_ORDER[i]]) <= new Date()) { lastPassed = PRAYER_ORDER[i]; break; }
    }
    if (!lastPassed) lastPassed = "Isha";

    var markBtn = document.createElement("button");
    markBtn.className = "btn btn-primary btn-full";
    if (completions[lastPassed]) {
      markBtn.textContent = lastPassed + " marked complete ✓";
      markBtn.disabled = true;
    } else {
      markBtn.textContent = "Mark " + lastPassed + " Complete";
      markBtn.addEventListener("click", function () {
        setSalahComplete(lastPassed);
        renderHome();
      });
    }
    container.appendChild(markBtn);

    if (lastPassed !== "Fajr" && !completions[lastPassed] && PRAYER_ORDER.slice(0, PRAYER_ORDER.indexOf(lastPassed)).some(function (n) { return !completions[n]; })) {
      var recovery = document.createElement("p");
      recovery.className = "salah-recovery-note";
      recovery.textContent = "The next Salah is still an opportunity.";
      container.appendChild(recovery);
    }

    var dayList = document.createElement("div");
    dayList.className = "salah-day-list";
    PRAYER_ORDER.forEach(function (n) {
      var item = document.createElement("div");
      item.className = "salah-day-item" + (completions[n] ? " done" : "") + (n === next.name && !next.tomorrow ? " current" : "");
      var nm = document.createElement("span");
      nm.className = "salah-day-name";
      nm.textContent = n;
      var mk = document.createElement("span");
      mk.className = "salah-day-mark";
      mk.textContent = completions[n] ? "✓" : "—";
      item.appendChild(nm);
      item.appendChild(mk);
      dayList.appendChild(item);
    });
    container.appendChild(dayList);

    startSalahCountdown(next.time);
  }

  function renderSalahView(container) {
    var settings = getPrayerSettings();
    if (!settings) {
      container.innerHTML = '<p class="quran-error-note">Prayer location isn’t set up. Tap “Choose a different priority” and pick Salah Consistency again.</p>';
      return;
    }
    container.innerHTML = '<p class="quran-loading-note">Loading prayer times…</p>';
    fetchPrayerTimesForToday().then(function (timings) {
      buildSalahCard(container, timings);
    }).catch(function () {
      container.innerHTML = '<p class="quran-error-note">Could not load prayer times. Check your internet connection and try again.</p>';
    });
  }

  // ---------- FITNESS VIEW ----------

  function renderPhoneExtra(p, container) {
    container.innerHTML = "";
    var meta = document.createElement("p");
    meta.className = "fitness-meta-line";
    meta.textContent = "Away from " + p.distraction + " • Instead: " + p.replacement;
    container.appendChild(meta);
  }

  function renderSleepView(p, container) {
    container.innerHTML = "";
    if (!p.wakeTime) {
      var label = document.createElement("p");
      label.className = "salah-next-label";
      label.textContent = "Sleep started";
      container.appendChild(label);
      var timeP = document.createElement("p");
      timeP.className = "salah-next-name";
      timeP.textContent = new Date(p.sleepStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      container.appendChild(timeP);
      var note = document.createElement("p");
      note.className = "muted-line";
      note.style.marginBottom = "16px";
      note.textContent = "Come back in the morning and tap “I'm Awake.”";
      container.appendChild(note);

      var awakeCard = document.createElement("div");
      awakeCard.style.textAlign = "center";
      var goodMorning = document.createElement("p");
      goodMorning.className = "priority-title";
      goodMorning.textContent = "Good Morning";
      awakeCard.appendChild(goodMorning);
      var areYouAwake = document.createElement("p");
      areYouAwake.className = "priority-why";
      areYouAwake.textContent = "Are you awake?";
      awakeCard.appendChild(areYouAwake);
      container.appendChild(awakeCard);

      var awakeBtn = document.createElement("button");
      awakeBtn.className = "btn btn-primary btn-full";
      awakeBtn.textContent = "I'M AWAKE";
      awakeBtn.addEventListener("click", function () {
        p.wakeTime = new Date().toISOString();
        p.status = "completed";
        savePriority(p);
        renderHome();
      });
      container.appendChild(awakeBtn);

      var editLink = document.createElement("button");
      editLink.className = "priority-change-link";
      editLink.textContent = "Edit sleep time";
      editLink.addEventListener("click", function () {
        var input = prompt("Enter sleep start time (HH:MM, 24h)", new Date(p.sleepStart).toTimeString().slice(0, 5));
        if (!input) return;
        var parts = input.split(":");
        if (parts.length !== 2) { showToast("Enter time as HH:MM"); return; }
        var d = new Date(p.sleepStart);
        d.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
        p.sleepStart = d.toISOString();
        savePriority(p);
        renderHome();
      });
      container.appendChild(editLink);
      return;
    }

    var start = new Date(p.sleepStart);
    var wake = new Date(p.wakeTime);
    var diffMs = wake - start;
    var hours = Math.floor(diffMs / 3600000);
    var mins = Math.round((diffMs % 3600000) / 60000);

    var windowLabel = document.createElement("p");
    windowLabel.className = "salah-next-label";
    windowLabel.textContent = "Sleep window";
    container.appendChild(windowLabel);
    var windowLine = document.createElement("p");
    windowLine.className = "salah-next-name";
    windowLine.style.fontSize = "17px";
    windowLine.textContent = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " → " + wake.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    container.appendChild(windowLine);

    var estLabel = document.createElement("p");
    estLabel.className = "salah-next-label";
    estLabel.style.marginTop = "12px";
    estLabel.textContent = "Estimated sleep duration";
    container.appendChild(estLabel);
    var estValue = document.createElement("p");
    estValue.className = "salah-countdown";
    estValue.textContent = hours + "h " + mins + "m / 8h target";
    container.appendChild(estValue);

    var disclaimer = document.createElement("p");
    disclaimer.className = "salah-recovery-note";
    disclaimer.textContent = "Estimated from the time between your two taps — NURA can't confirm you were asleep the whole time.";
    container.appendChild(disclaimer);
  }

  function renderFitnessExtra(p, container) {
    container.innerHTML = "";
    var bp = FITNESS_BODY_PARTS.find(function (b) { return b.key === p.bodyPart; }) || FITNESS_BODY_PARTS[0];

    var meta = document.createElement("p");
    meta.className = "fitness-meta-line";
    meta.textContent = bp.label + " • " + p.minutes + " min";
    container.appendChild(meta);

    if (!p.warmupDone && bp.warmup.length) {
      var wTitle = document.createElement("p");
      wTitle.className = "picker-step-title";
      wTitle.textContent = "Warm-up first:";
      container.appendChild(wTitle);
      var list = document.createElement("ul");
      list.className = "fitness-warmup-list";
      bp.warmup.forEach(function (w) {
        var li = document.createElement("li");
        li.textContent = w;
        list.appendChild(li);
      });
      container.appendChild(list);

      var doneBtn = document.createElement("button");
      doneBtn.className = "btn btn-primary btn-full";
      doneBtn.textContent = "Warm-up done — start workout";
      doneBtn.addEventListener("click", function () {
        p.warmupDone = true;
        savePriority(p);
        renderHome();
      });
      container.appendChild(doneBtn);

      var skipBtn = document.createElement("button");
      skipBtn.className = "priority-change-link";
      skipBtn.textContent = "Skip warm-up";
      skipBtn.addEventListener("click", function () {
        p.warmupDone = true;
        savePriority(p);
        renderHome();
      });
      container.appendChild(skipBtn);

      document.getElementById("priority-timer-wrap").classList.add("hidden");
      return;
    }

    var wTitle2 = document.createElement("p");
    wTitle2.className = "picker-step-title";
    wTitle2.textContent = "Workout:";
    container.appendChild(wTitle2);
    var list2 = document.createElement("ul");
    list2.className = "fitness-warmup-list";
    bp.workout.forEach(function (w) {
      var li = document.createElement("li");
      li.textContent = w;
      list2.appendChild(li);
    });
    container.appendChild(list2);
  }

  function renderTodaysPriority() {
    var checkinEl = document.getElementById("priority-checkin");
    var pickerEl = document.getElementById("priority-picker");
    var activeEl = document.getElementById("priority-active");
    var genericEl = document.getElementById("priority-view-generic");
    var salahEl = document.getElementById("priority-view-salah");
    var sleepEl = document.getElementById("priority-view-sleep");
    checkinEl.classList.add("hidden");
    pickerEl.classList.add("hidden");
    activeEl.classList.add("hidden");
    genericEl.classList.add("hidden");
    salahEl.classList.add("hidden");
    sleepEl.classList.add("hidden");
    document.getElementById("priority-extra-content").innerHTML = "";
    document.getElementById("focus-duration-row").classList.add("hidden");
    stopSalahCountdown();

    if (focusState.adhocLabel) {
      document.getElementById("priority-title").textContent = focusState.adhocLabel;
      document.getElementById("priority-why").textContent = "A quick session started from Bhai AI — not today's chosen priority.";
      activeEl.classList.remove("hidden");
      genericEl.classList.remove("hidden");
      document.getElementById("priority-timer-wrap").classList.remove("hidden");
      document.getElementById("priority-done-text").classList.add("hidden");
      document.getElementById("priority-change-btn").classList.add("hidden");
      updateFocusUI();
      document.getElementById("progress-line").textContent = focusState.running ? "In progress — timer running." : "Paused — pick up when ready.";
      return;
    }
    document.getElementById("priority-change-btn").classList.remove("hidden");

    var p = getCurrentPriority();
    var today = todayKey();

    if (p && p.date !== today && p.status === "pending") {
      var checkinText = p.kind === "salah"
        ? "Yesterday's Salah Consistency — " + PRAYER_ORDER.filter(function (n) { return (readJSON("nc_salah_completions", {})[p.date] || {})[n]; }).length + " of 5 prayers marked complete. What happened overall?"
        : "Yesterday you planned: “" + p.title + "”. What happened?";
      document.getElementById("priority-checkin-text").textContent = checkinText;
      checkinEl.classList.remove("hidden");
      renderProgressLine(null);
      return;
    }

    if (!p || p.date !== today) {
      renderPresetPicker();
      pickerEl.classList.remove("hidden");
      renderProgressLine(null);
      return;
    }

    document.getElementById("priority-title").textContent = p.title;
    document.getElementById("priority-why").textContent = "Why this? " + p.why;
    activeEl.classList.remove("hidden");

    if (p.kind === "salah") {
      salahEl.classList.remove("hidden");
      renderSalahView(salahEl);
      renderProgressLine(p);
      return;
    }

    if (p.kind === "sleep") {
      sleepEl.classList.remove("hidden");
      renderSleepView(p, sleepEl);
      renderProgressLine(p);
      return;
    }

    genericEl.classList.remove("hidden");

    if (focusState.linkedPriorityId !== p.id) {
      focusState.linkedPriorityId = p.id;
      if (!focusState.running) {
        if (p.minutes) setFocusDurationMinutes(p.minutes);
        focusState.remaining = focusSecondsTotal();
      }
    }

    if (p.kind === "fitness") {
      renderFitnessExtra(p, document.getElementById("priority-extra-content"));
    } else if (p.kind === "phone") {
      renderPhoneExtra(p, document.getElementById("priority-extra-content"));
    }

    var timerWrap = document.getElementById("priority-timer-wrap");
    var doneText = document.getElementById("priority-done-text");
    var isPending = p.status === "pending";
    var showTimer = isPending && (p.kind !== "fitness" || p.warmupDone);
    timerWrap.classList.toggle("hidden", !showTimer);
    doneText.classList.toggle("hidden", isPending);
    if (showTimer) document.getElementById("focus-duration-row").classList.toggle("hidden", !!p.minutes);

    updateFocusUI();
    renderProgressLine(p);
  }

  function renderHome() {
    ensureJourneyStarted();
    document.getElementById("home-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    var name = localStorage.getItem("nc_user_name");
    document.getElementById("home-greeting").textContent = name ? ("Assalamu Alaikum, " + name) : "Assalamu Alaikum";
    document.getElementById("avatar-initial").textContent = name ? name.charAt(0).toUpperCase() : "N";
    document.getElementById("home-motivation").textContent = getTodaysMotivationLine();
    document.getElementById("journey-badge-text").textContent = "DAY " + getJourneyDay() + " OF YOUR CHANGE JOURNEY";

    renderTodaysPriority();
    renderProgressGraph();
  }

  function initPriorityUI() {
    document.getElementById("duniya-tool-back").addEventListener("click", function () { setActiveView("duniya"); });
    document.getElementById("checkin-completed-btn").addEventListener("click", function () { submitAccountability("completed"); });
    document.getElementById("checkin-partly-btn").addEventListener("click", function () { submitAccountability("partial"); });
    document.getElementById("checkin-notyet-btn").addEventListener("click", function () { submitAccountability("not-yet"); });

    function saveCustom() {
      var input = document.getElementById("priority-custom-input");
      var val = input.value.trim();
      if (!val) return;
      setTodaysPriority(null, val);
      input.value = "";
      pendingAdjustmentNote = null;
      renderHome();
    }
    document.getElementById("priority-custom-btn").addEventListener("click", saveCustom);
    document.getElementById("priority-custom-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") saveCustom();
    });

    document.getElementById("priority-change-btn").addEventListener("click", chooseDifferentPriority);

    document.getElementById("progress-details-close").addEventListener("click", function () {
      document.getElementById("modal-progress-details").classList.add("hidden");
    });

  }

  // ---------- FOCUS TIMER ----------

  var DURATION_PRESETS = [5, 10, 15, 20, 25, 30, 45, 60];

  function getFocusDurationMinutes() {
    var stored = Number(localStorage.getItem("nc_focus_duration"));
    return stored > 0 ? stored : 20;
  }

  function setFocusDurationMinutes(mins) {
    localStorage.setItem("nc_focus_duration", String(mins));
  }

  function focusSecondsTotal() {
    return getFocusDurationMinutes() * 60;
  }

  var focusState = { remaining: focusSecondsTotal(), running: false, intervalId: null, linkedPriorityId: null, adhocLabel: null };

  function formatClock(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function updateFocusUI() {
    var total = focusSecondsTotal();
    var clock = document.getElementById("focus-clock");
    if (clock) clock.textContent = formatClock(focusState.remaining);
    var startBtn = document.getElementById("focus-start-btn");
    var pauseBtn = document.getElementById("focus-pause-btn");
    var stopBtn = document.getElementById("focus-stop-btn");
    if (!startBtn) return;
    startBtn.classList.toggle("hidden", focusState.running);
    pauseBtn.classList.toggle("hidden", !focusState.running);
    stopBtn.classList.toggle("hidden", focusState.remaining === total && !focusState.running);
    var resumeShown = !focusState.running && focusState.remaining > 0 && focusState.remaining < total;
    startBtn.textContent = resumeShown ? "Resume" : "Start Now";
    renderFocusDurationUI();
    if (getCurrentPriority()) renderProgressLine(getCurrentPriority());
  }

  function renderFocusDurationUI() {
    var total = focusSecondsTotal();
    var lockedIn = focusState.running || focusState.remaining !== total;
    var mins = getFocusDurationMinutes();
    document.querySelectorAll(".duration-chip").forEach(function (chip) {
      var chipMins = Number(chip.dataset.minutes);
      chip.classList.toggle("active", chipMins === mins);
      chip.disabled = lockedIn;
    });
    var customInput = document.getElementById("focus-duration-custom");
    if (!customInput) return;
    customInput.disabled = lockedIn;
    if (document.activeElement !== customInput) {
      customInput.value = DURATION_PRESETS.indexOf(mins) === -1 ? mins : "";
    }
  }

  function tickFocus() {
    focusState.remaining -= 1;
    if (focusState.remaining <= 0) {
      focusState.remaining = 0;
      stopFocusInterval();
      focusState.running = false;
      updateFocusUI();
      openFocusCheckModal();
      return;
    }
    updateFocusUI();
  }

  function stopFocusInterval() {
    if (focusState.intervalId) {
      clearInterval(focusState.intervalId);
      focusState.intervalId = null;
    }
  }

  function beginFocusInterval() {
    focusState.running = true;
    stopFocusInterval();
    focusState.intervalId = setInterval(tickFocus, 1000);
    updateFocusUI();
  }

  function startFocusForPriority() {
    var p = getCurrentPriority();
    if (!p) return;
    if (p.minutes) setFocusDurationMinutes(p.minutes);
    focusState.remaining = focusSecondsTotal();
    focusState.linkedPriorityId = p.id;
    focusState.adhocLabel = null;
    beginFocusInterval();
    var clock = document.getElementById("focus-clock");
    if (clock) clock.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function startAdhocFocus(label, minutes) {
    if (minutes) setFocusDurationMinutes(minutes);
    focusState.remaining = focusSecondsTotal();
    focusState.linkedPriorityId = null;
    focusState.adhocLabel = label;
    beginFocusInterval();
  }

  function pauseFocus() {
    focusState.running = false;
    stopFocusInterval();
    updateFocusUI();
  }

  function stopFocus() {
    focusState.running = false;
    stopFocusInterval();
    focusState.remaining = focusSecondsTotal();
    focusState.adhocLabel = null;
    updateFocusUI();
  }

  function openFocusCheckModal() {
    var p = focusState.linkedPriorityId ? getCurrentPriority() : null;
    var label = (p && p.id === focusState.linkedPriorityId) ? p.title : focusState.adhocLabel;
    document.getElementById("focus-check-text").textContent = label
      ? ("Did you actually finish “" + label + "”, or just the timer?")
      : "Did you actually finish what you were working on, or just the timer?";
    document.getElementById("modal-focus-check").classList.remove("hidden");
  }

  function selectFocusDuration(mins) {
    var total = focusSecondsTotal();
    if (focusState.running || focusState.remaining !== total) {
      showToast("Finish or stop the current session before changing the length");
      return;
    }
    setFocusDurationMinutes(mins);
    focusState.remaining = focusSecondsTotal();
    updateFocusUI();
  }

  function initFocusTimer() {
    document.getElementById("focus-start-btn").addEventListener("click", function () {
      if (getCurrentPriority()) startFocusForPriority();
    });
    document.getElementById("focus-pause-btn").addEventListener("click", pauseFocus);
    document.getElementById("focus-stop-btn").addEventListener("click", function () { stopFocus(); renderHome(); });

    document.querySelectorAll(".duration-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        selectFocusDuration(Number(chip.dataset.minutes));
      });
    });

    var customInput = document.getElementById("focus-duration-custom");
    customInput.addEventListener("change", function () {
      var val = Math.round(Number(customInput.value));
      if (val > 0 && val <= 180) {
        selectFocusDuration(val);
      } else {
        showToast("Enter a number of minutes between 1 and 180");
        renderFocusDurationUI();
      }
    });

    document.getElementById("focus-check-done").addEventListener("click", function () {
      if (focusState.linkedPriorityId) {
        markPriorityStatusToday("completed");
      }
      document.getElementById("modal-focus-check").classList.add("hidden");
      stopFocus();
      renderHome();
    });

    document.getElementById("focus-check-notdone").addEventListener("click", function () {
      document.getElementById("modal-focus-check").classList.add("hidden");
      stopFocus();
      renderHome();
    });

    updateFocusUI();
  }

  // ---------- SUNNAH: ROUTINE ----------

  // Dhikr citations below were cross-checked against sunnah.com/named
  // hadith numbering before use (see docs/decisions.md), not generated
  // from memory. Ayat al-Kursi's Arabic is pulled directly from the
  // already-verified Tanzil Quran file (Surah 2:255), not re-typed.
  var AFTER_SALAH_DHIKR_ITEMS = [
    {
      arabic: "اللَّهُمَّ أَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ، تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ",
      transliteration: "Allahumma antas-salamu wa minkas-salam, tabarakta ya dhal-jalali wal-ikram",
      meaning: "O Allah, You are Peace and from You comes peace. Blessed are You, Owner of majesty and honor.",
      source: "Sahih Muslim 592, narrated by A’ishah"
    },
    {
      arabic: "سُبْحَانَ اللَّهِ (٣٣) الْحَمْدُ لِلَّهِ (٣٣) اللَّهُ أَكْبَرُ (٣٣) لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ",
      transliteration: "SubhanAllah (x33), Alhamdulillah (x33), Allahu Akbar (x33), then: La ilaha illallah, wahdahu la sharika lah, lahul-mulku wa lahul-hamd, wa huwa 'ala kulli shay'in qadir",
      meaning: "Glory be to Allah (33x), praise be to Allah (33x), Allah is Greatest (33x), then: There is no god but Allah, alone, without partner; His is the dominion and His is the praise, and He is capable of all things.",
      source: "Sahih Muslim 597a, narrated by Abu Hurairah",
      tasbih: { mode: "phases", phases: [
        { label: "SubhanAllah", arabic: "سُبْحَانَ اللَّهِ", target: 33 },
        { label: "Alhamdulillah", arabic: "الْحَمْدُ لِلَّهِ", target: 33 },
        { label: "Allahu Akbar", arabic: "اللَّهُ أَكْبَرُ", target: 33 }
      ] }
    },
    {
      arabic: "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ وَلَا يُحِيطُونَ بِشَىْءٍ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ وَلَا يَـُٔودُهُۥ حِفْظُهُمَا وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ",
      ruku: 35,
      transliteration: null,
      meaning: "Ayat al-Kursi (Surah Al-Baqarah 2:255). Translation not yet added — see Sunnah → Quran for the verified Arabic source.",
      source: "Reciting it after each prescribed prayer: An-Nasa’i, Al-Kubra 9848, graded sahih by An-Nasa’i and Ibn Hibban, narrated by Abu Umamah. Verse text: Tanzil Project (Qur’an 2:255). Ruku number from Quran Foundation (api.quran.com)."
    }
  ];

  var MORNING_DHIKR_ITEMS = [{
    arabic: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
    transliteration: "Asbahna wa asbahal mulku lillah, wal-hamdu lillah, la ilaha illallahu wahdahu la sharika lah, lahul-mulku wa lahul-hamd, wa huwa 'ala kulli shay'in qadir",
    meaning: "We have entered the morning, and with it all dominion belongs to Allah, and praise is for Allah. There is no god but Allah, alone, without partner. His is the dominion and His is the praise, and He is capable of all things.",
    source: "Sahih Muslim 2723"
  }];

  var EVENING_DHIKR_ITEMS = [{
    arabic: "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
    transliteration: "Amsayna wa amsal mulku lillah, wal-hamdu lillah, la ilaha illallahu wahdahu la sharika lah, lahul-mulku wa lahul-hamd, wa huwa 'ala kulli shay'in qadir",
    meaning: "We have entered the evening, and with it all dominion belongs to Allah, and praise is for Allah. There is no god but Allah, alone, without partner. His is the dominion and His is the praise, and He is capable of all things.",
    source: "Sahih Muslim 2723 (evening form — recited with ‘Amsayna’ in place of ‘Asbahna’)"
  }];

  var AYATKURSI_ITEMS = [{
    arabic: "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ وَلَا يُحِيطُونَ بِشَىْءٍ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ وَلَا يَـُٔودُهُۥ حِفْظُهُمَا وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ",
    ruku: 35,
    transliteration: null,
    meaning: "Ayat al-Kursi (Surah Al-Baqarah 2:255). Translation not yet added — see Sunnah → Quran for the verified Arabic source.",
    source: "Tanzil Project (Qur’an 2:255). Ruku number from Quran Foundation (api.quran.com)."
  }];

  var ROUTINE_SECTIONS = [
    { id: "before-sleep", title: "Before Sleep", actions: [
      { id: "bs-wudu", name: "Make wudu before sleeping" },
      { id: "bs-ayatkursi", name: "Recite Ayat al-Kursi", items: AYATKURSI_ITEMS },
      { id: "bs-lasttwo", name: "Recite the last two verses of Al-Baqarah", items: [
        {
          arabic: "مَنْ قَرَأَ بِالآيَتَيْنِ مِنْ آخِرِ سُورَةِ الْبَقَرَةِ فِي لَيْلَةٍ كَفَتَاهُ",
          transliteration: "Man qara'a bil-ayatayni min akhiri surat al-Baqarah fi laylatin kafatah",
          meaning: "Whoever recites the last two verses of Surat al-Baqarah on a night, they will be sufficient for him.",
          source: "Sahih al-Bukhari 5009, Sahih Muslim 807, narrated by Abu Mas'ud"
        },
        {
          arabic: "ءَامَنَ ٱلرَّسُولُ بِمَآ أُنزِلَ إِلَيْهِ مِن رَّبِّهِۦ وَٱلْمُؤْمِنُونَ كُلٌّ ءَامَنَ بِٱللَّهِ وَمَلَٰٓئِكَتِهِۦ وَكُتُبِهِۦ وَرُسُلِهِۦ لَا نُفَرِّقُ بَيْنَ أَحَدٍ مِّن رُّسُلِهِۦ وَقَالُوا۟ سَمِعْنَا وَأَطَعْنَا غُفْرَانَكَ رَبَّنَا وَإِلَيْكَ ٱلْمَصِيرُ لَا يُكَلِّفُ ٱللَّهُ نَفْسًا إِلَّا وُسْعَهَا لَهَا مَا كَسَبَتْ وَعَلَيْهَا مَا ٱكْتَسَبَتْ رَبَّنَا لَا تُؤَاخِذْنَآ إِن نَّسِينَآ أَوْ أَخْطَأْنَا رَبَّنَا وَلَا تَحْمِلْ عَلَيْنَآ إِصْرًا كَمَا حَمَلْتَهُۥ عَلَى ٱلَّذِينَ مِن قَبْلِنَا رَبَّنَا وَلَا تُحَمِّلْنَا مَا لَا طَاقَةَ لَنَا بِهِۦ وَٱعْفُ عَنَّا وَٱغْفِرْ لَنَا وَٱرْحَمْنَآ أَنتَ مَوْلَىٰنَا فَٱنصُرْنَا عَلَى ٱلْقَوْمِ ٱلْكَٰفِرِينَ",
          ruku: 41,
          transliteration: null,
          meaning: "(2:285) The Messenger has believed in what was revealed to him from his Lord, and [so have] the believers. All of them have believed in Allah and His angels and His books and His messengers, “We make no distinction between any of His messengers.” And they say, “We hear and we obey. [We seek] Your forgiveness, our Lord, and to You is the [final] destination.” (2:286) Allah does not charge a soul except with that within its capacity. It will have the consequence of what good it has gained, and it will bear the consequence of what evil it has earned. “Our Lord, do not impose blame upon us if we have forgotten or erred. Our Lord, do not lay upon us a burden like that which You laid upon those before us. Our Lord, do not burden us with that which we have no ability to bear. And pardon us, and forgive us, and have mercy upon us. You are our protector, so give us victory over the disbelieving people.”",
          source: "Surah Al-Baqarah 2:285–286. Arabic: Tanzil Project. Translation: Saheeh International, via the Quran Foundation API (api.quran.com). Ruku number from Quran Foundation."
        }
      ] },
      { id: "bs-tasbih", name: "Tasbih before sleep", items: [
        {
          arabic: "تُسَبِّحِينَ اللَّهَ عِنْدَ مَنَامِكِ ثَلَاثًا وَثَلَاثِينَ، وَتَحْمَدِينَ اللَّهَ ثَلَاثًا وَثَلَاثِينَ، وَتُكَبِّرِينَ اللَّهَ أَرْبَعًا وَثَلَاثِينَ",
          transliteration: "Tusabbihina Allaha 'inda manamiki thalathan wa thalathin, wa tahmadina Allaha thalathan wa thalathin, wa tukabbirina Allaha arba'an wa thalathin",
          meaning: "When you go to bed, recite 'Subhan Allah' thirty-three times, 'Alhamdulillah' thirty-three times, and 'Allahu Akbar' thirty-four times.",
          source: "Sahih al-Bukhari 5362, narrated by Ali ibn Abi Talib — the Prophet ﷺ taught this to Fatimah instead of a servant",
          tasbih: { mode: "phases", phases: [
            { label: "SubhanAllah", arabic: "سُبْحَانَ اللَّهِ", target: 33 },
            { label: "Alhamdulillah", arabic: "الْحَمْدُ لِلَّهِ", target: 33 },
            { label: "Allahu Akbar", arabic: "اللَّهُ أَكْبَرُ", target: 34 }
          ] }
        }
      ] },
      { id: "bs-dua", name: "Make a short dua before sleeping" }
    ]},
    { id: "tahajjud", title: "Tahajjud", actions: [
      { id: "th-intention", name: "Set an intention or alarm for Tahajjud" },
      { id: "th-pray", name: "Pray Tahajjud" }
    ]},
    { id: "fajr", title: "Fajr", actions: [
      { id: "fj-sunnah-before", name: "Pray Sunnah before Fajr (2 rakah)" },
      { id: "fj-pray", name: "Pray Fajr on time" },
      { id: "fj-dhikr", name: "Dhikr after salah", items: AFTER_SALAH_DHIKR_ITEMS }
    ]},
    { id: "morning-adhkar", title: "Morning Adhkar", actions: [
      { id: "ma-ayatkursi", name: "Ayat al-Kursi", items: AYATKURSI_ITEMS },
      { id: "ma-dhikr", name: "Morning dhikr (Asbahna...)", items: MORNING_DHIKR_ITEMS },
      { id: "ma-quran", name: "Read a portion of Qur'an", link: { subtab: "quran", label: "Open Quran" } }
    ]},
    { id: "ishraq-duha", title: "Ishraq / Duha", actions: [
      { id: "id-ishraq", name: "Pray Ishraq after sunrise" },
      { id: "id-duha", name: "Pray Duha" }
    ]},
    { id: "dhuhr", title: "Dhuhr", actions: [
      { id: "dh-before", name: "Sunnah before Dhuhr" },
      { id: "dh-pray", name: "Pray Dhuhr on time" },
      { id: "dh-dhikr", name: "Dhikr after salah", items: AFTER_SALAH_DHIKR_ITEMS },
      { id: "dh-after", name: "Sunnah after Dhuhr" }
    ]},
    { id: "jumuah", title: "Jumu'ah (Friday)", actions: [
      { id: "jm-ghusl", name: "Take ghusl before Jumu'ah", items: [
        {
          arabic: "إِذَا جَاءَ أَحَدُكُمُ الْجُمُعَةَ فَلْيَغْتَسِلْ",
          transliteration: "Idha ja'a ahadukumul-Jumu'ata falyaghtasil",
          meaning: "Anyone of you attending the Friday (prayer) should take a bath.",
          source: "Sahih al-Bukhari 877, narrated by Abdullah ibn Umar"
        }
      ] },
      { id: "jm-early", name: "Go early to the masjid", items: [
        {
          arabic: "مَنِ اغْتَسَلَ يَوْمَ الْجُمُعَةِ غُسْلَ الْجَنَابَةِ ثُمَّ رَاحَ فَكَأَنَّمَا قَرَّبَ بَدَنَةً",
          transliteration: "Man ightasala yawmal-Jumu'ati ghusla-l-janabati thumma rah, fa ka'annama qarraba badanah...",
          meaning: "Whoever takes a bath on Friday like the bath for major ritual impurity and then goes early (in the first hour), it is as if he sacrificed a camel; going later each hour is likened to a smaller sacrifice, down to just an egg in the last hour before the khutbah begins.",
          source: "Sahih al-Bukhari 881, narrated by Abu Hurairah"
        }
      ] },
      { id: "jm-kahf", name: "Recite Surah Al-Kahf", link: { subtab: "quran", label: "Open Al-Kahf", surah: 18 }, items: [
        {
          arabic: "مَنْ قَرَأَ سُورَةَ الْكَهْفِ فِي يَوْمِ الْجُمُعَةِ أَضَاءَ لَهُ النُّورُ مَا بَيْنَ الْجُمُعَتَيْنِ",
          transliteration: "Man qara'a Surata-l-Kahfi fi yawmi-l-Jumu'ati adaa'a lahun-nuru ma baynal-Jumu'atayn",
          meaning: "Whoever reads Surah al-Kahf on the day of Jumu'ah, a light will shine for him between the two Fridays.",
          source: "Mustadrak al-Hakim; graded Sahih in Sahih at-Targhib wa at-Tarhib 736, narrated by Abu Sa'id al-Khudri"
        }
      ] },
      { id: "jm-salawat", name: "Send extra salawat on the Prophet ﷺ", items: [
        {
          arabic: "إِنَّ مِنْ أَفْضَلِ أَيَّامِكُمْ يَوْمَ الْجُمُعَةِ ... فَأَكْثِرُوا عَلَىَّ مِنَ الصَّلاَةِ فِيهِ",
          transliteration: "Inna min afdali ayyamikum yawmal-Jumu'ah ... fa akthiru 'alayya minas-salati fih",
          meaning: "Among the most excellent of your days is Friday, so send more blessings (salawat) upon me on that day, for your blessings are presented to me.",
          source: "Sunan Abi Dawud 1047, graded Sahih (Al-Albani), narrated by Aws ibn Aws"
        }
      ] },
      { id: "jm-pray", name: "Pray Jumu'ah" },
      { id: "jm-quiet", name: "Stay silent and listen during the khutbah", items: [
        {
          arabic: "إِذَا قُلْتَ لِصَاحِبِكَ يَوْمَ الْجُمُعَةِ أَنْصِتْ وَالإِمَامُ يَخْطُبُ فَقَدْ لَغَوْتَ",
          transliteration: "Idha qulta li-sahibika yawmal-Jumu'ati ansit wal-imamu yakhtubu faqad laghawt",
          meaning: "If you even tell your companion to 'be quiet' while the Imam is delivering the khutbah, you have spoken needlessly (and reduced your reward).",
          source: "Sahih al-Bukhari 934, narrated by Abu Hurairah"
        }
      ] },
      { id: "jm-dua-hour", name: "Make dua — there's an hour of acceptance", items: [
        {
          arabic: "فِيهِ سَاعَةٌ لاَ يُوَافِقُهَا عَبْدٌ مُسْلِمٌ وَهْوَ قَائِمٌ يُصَلِّي يَسْأَلُ اللَّهَ تَعَالَى شَيْئًا إِلاَّ أَعْطَاهُ إِيَّاهُ",
          transliteration: "Fihi sa'atun la yuwafiquha 'abdun Muslimun wa huwa qa'imun yusalli yas'alu-llaha ta'ala shay'an illa a'tahu iyyah",
          meaning: "There is an hour on Friday in which, if a Muslim prays and asks Allah for something, He will give it to him. The Prophet ﷺ indicated it is a short time (commonly held to be in the last hour before Maghrib).",
          source: "Sahih al-Bukhari 935, narrated by Abu Hurairah"
        }
      ] }
    ]},
    { id: "asr", title: "Asr", actions: [
      { id: "as-pray", name: "Pray Asr on time" },
      { id: "as-dhikr", name: "Dhikr after salah", items: AFTER_SALAH_DHIKR_ITEMS }
    ]},
    { id: "maghrib", title: "Maghrib", actions: [
      { id: "mg-pray", name: "Pray Maghrib on time" },
      { id: "mg-dhikr", name: "Dhikr after salah", items: AFTER_SALAH_DHIKR_ITEMS },
      { id: "mg-evening", name: "Begin evening adhkar" }
    ]},
    { id: "evening-adhkar", title: "Evening Adhkar", actions: [
      { id: "ea-ayatkursi", name: "Ayat al-Kursi", items: AYATKURSI_ITEMS },
      { id: "ea-dhikr", name: "Evening dhikr (Amsayna...)", items: EVENING_DHIKR_ITEMS }
    ]},
    { id: "isha", title: "Isha", actions: [
      { id: "is-pray", name: "Pray Isha on time" },
      { id: "is-dhikr", name: "Dhikr after salah", items: AFTER_SALAH_DHIKR_ITEMS }
    ]},
    { id: "witr", title: "Witr", actions: [
      { id: "wt-pray", name: "Pray Witr", items: [
        {
          arabic: "اللَّهُمَّ اهْدِنِي فِيمَنْ هَدَيْتَ، وَعَافِنِي فِيمَنْ عَافَيْتَ، وَتَوَلَّنِي فِيمَنْ تَوَلَّيْتَ، وَبَارِكْ لِي فِيمَا أَعْطَيْتَ، وَقِنِي شَرَّ مَا قَضَيْتَ، فَإِنَّكَ تَقْضِي وَلَا يُقْضَى عَلَيْكَ، وَإِنَّهُ لَا يَذِلُّ مَنْ وَالَيْتَ، تَبَارَكْتَ رَبَّنَا وَتَعَالَيْتَ",
          transliteration: "Allahummahdini fiman hadayt, wa 'afini fiman 'afayt, wa tawallani fiman tawallayt, wa barik li fima a'tayt, wa qini sharra ma qadayt, fa innaka taqdi wa la yuqda 'alayk, wa innahu la yadhillu man walayt, tabarakta Rabbana wa ta'alayt",
          meaning: "O Allah, guide me among those You have guided, pardon me among those You have pardoned, befriend me among those You have befriended, bless me in what You have granted, and save me from the evil that You have decreed. Indeed You decree, and none can pass decree upon You. He is not humiliated whom You have befriended. Blessed are You, our Lord, and Exalted.",
          source: "Jami' at-Tirmidhi 464, graded Sahih (Darussalam), narrated by Al-Hasan ibn Ali — Dua al-Qunoot, taught to him by the Prophet ﷺ to recite in Witr"
        }
      ] }
    ]}
  ];

  // Citations cross-checked against sunnah.com / named hadith numbers
  // before use (see docs/decisions.md). Where a hadith's authenticity
  // grading wasn't independently confirmed, only the source (collection +
  // number) is given, not a grading claim.
  var AKHLAQ_ITEMS = [
    { id: "ch-gaze", name: "Lower your gaze", items: [{
      arabic: "يَا عَلِيُّ لاَ تُتْبِعِ النَّظْرَةَ النَّظْرَةَ فَإِنَّ لَكَ الأُولَى وَلَيْسَتْ لَكَ الآخِرَةُ",
      transliteration: "Ya Ali, la tutbi'in-nazrata an-nazrah, fa inna laka al-ula wa laysat laka al-akhirah",
      meaning: "O Ali, do not follow one glance with another — the first is forgiven, but not the second.",
      source: "Sunan Abi Dawud 2149, the Prophet speaking to Ali"
    }]},
    { id: "ch-speech", name: "Speak kindly, avoid backbiting", items: [{
      arabic: "مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ",
      transliteration: "Man kana yu'minu billahi wal-yawmil-akhiri falyaqul khayran aw liyasmut",
      meaning: "Whoever believes in Allah and the Last Day should speak what is good or remain silent.",
      source: "Sahih al-Bukhari 6136 / 6475, Sahih Muslim 47, narrated by Abu Hurairah"
    }]},
    { id: "ch-charity", name: "Give charity, even something small", items: [{
      arabic: "اتَّقُوا النَّارَ وَلَوْ بِشِقِّ تَمْرَةٍ",
      transliteration: "Ittaqun-nara wa law bi-shiqqi tamrah",
      meaning: "Protect yourself from the Fire, even with half a date given in charity.",
      source: "Sahih al-Bukhari 6540, Sahih Muslim 1016, narrated by ‘Adi ibn Hatim"
    }]},
    { id: "ch-help", name: "Help someone today", items: [{
      arabic: "وَاللَّهُ فِي عَوْنِ الْعَبْدِ مَا كَانَ الْعَبْدُ فِي عَوْنِ أَخِيهِ",
      transliteration: "Wallahu fi 'awnil-'abdi ma kanal-'abdu fi 'awni akhih",
      meaning: "Allah helps His servant for as long as the servant helps his brother.",
      source: "Sahih Muslim 2699a, narrated by Abu Hurairah"
    }]},
    { id: "ch-anger", name: "Keep your anger in check", items: [{
      arabic: "لَيْسَ الشَّدِيدُ بِالصُّرَعَةِ، إِنَّمَا الشَّدِيدُ الَّذِي يَمْلِكُ نَفْسَهُ عِنْدَ الْغَضَبِ",
      transliteration: "Laysash-shadidu bis-su'rah, innamash-shadidul-ladhi yamliku nafsahu 'indal-ghadab",
      meaning: "The strong one is not the one who overpowers others; the strong one is the one who controls himself when angry.",
      source: "Sahih al-Bukhari 6114, Sahih Muslim 2609, narrated by Abu Hurairah"
    }]},
    { id: "ch-salam", name: "Smile and give salam", items: [{
      arabic: "تَبَسُّمُكَ فِي وَجْهِ أَخِيكَ لَكَ صَدَقَةٌ",
      transliteration: "Tabassumuka fi wajhi akhika laka sadaqah",
      meaning: "Your smiling in the face of your brother is charity.",
      source: "Jami’ at-Tirmidhi 1956, narrated by Abu Dharr (graded hasan gharib by at-Tirmidhi)"
    }]},
    { id: "ch-gratitude", name: "Take one moment of gratitude", items: [{
      arabic: "لاَ يَشْكُرُ اللَّهَ مَنْ لاَ يَشْكُرُ النَّاسَ",
      transliteration: "La yashkurullaha man la yashkurun-nas",
      meaning: "Whoever does not thank people has not thanked Allah.",
      source: "Sunan Abi Dawud 4811, narrated by Abu Hurairah (graded sahih by Al-Albani)"
    }]},
    { id: "ch-tongue", name: "Guard your tongue", items: [{
      arabic: "مَنْ يَضْمَنْ لِي مَا بَيْنَ لَحْيَيْهِ وَمَا بَيْنَ رِجْلَيْهِ أَضْمَنْ لَهُ الْجَنَّةَ",
      transliteration: "Man yadman li ma bayna lahyayhi wa ma bayna rijlayhi adman lahul-jannah",
      meaning: "Whoever guarantees me what is between his jaws (his tongue) and what is between his legs, I guarantee him Paradise.",
      source: "Sahih al-Bukhari 6474, narrated by Sahl ibn Sa’d"
    }]},
    { id: "ch-knowledge", name: "Seek a little knowledge today", items: [{
      arabic: "مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ",
      transliteration: "Man salaka tariqan yaltamisu fihi 'ilman sahhalallahu lahu bihi tariqan ilal-jannah",
      meaning: "Whoever takes a path seeking knowledge, Allah makes easy for him a path to Paradise.",
      source: "Sahih Muslim 2699a — the same hadith as “Help someone today” above, narrated by Abu Hurairah"
    }]},
    { id: "ch-character", name: "Aim for good character, not just correct actions", items: [{
      arabic: "إِنَّ مِنْ خِيَارِكُمْ أَحْسَنَكُمْ أَخْلاَقًا",
      transliteration: "Inna min khiyarikum ahsanakum akhlaqan",
      meaning: "Indeed, among the best of you are those with the best character.",
      source: "Sahih al-Bukhari 3559, narrated by ‘Abdullah ibn ‘Amr"
    }]},
    { id: "ch-neighbor", name: "Make sure your neighbor is safe from your harm", items: [{
      arabic: "لَا يَدْخُلُ الْجَنَّةَ مَنْ لَا يَأْمَنُ جَارُهُ بَوَائِقَهُ",
      transliteration: "La yadkhulul-jannata man la ya'manu jaruhu bawa'iqah",
      meaning: "He will not enter Paradise whose neighbor is not safe from his harm.",
      source: "Sahih Muslim 46, narrated by Abu Hurairah"
    }]}
  ];

  var sunnahSectionOpenState = {};

  function getSunnahLogs() {
    return readJSON("nc_sunnah_log", {});
  }

  function getDaySunnahLog(dateKey) {
    var all = getSunnahLogs();
    return all[dateKey] || {};
  }

  function setDaySunnahLog(dateKey, log) {
    var all = getSunnahLogs();
    all[dateKey] = log;
    writeJSON("nc_sunnah_log", all);
  }

  function toggleSunnahAction(actionId) {
    var key = todayKey();
    var log = getDaySunnahLog(key);
    log[actionId] = !log[actionId];
    setDaySunnahLog(key, log);
  }

  var sunnahItemExpandState = {};

  function loadTasbihState(key) {
    var all = {};
    try { all = JSON.parse(localStorage.getItem("nc_tasbih_counts") || "{}"); } catch (e) { all = {}; }
    var state = all[key];
    var today = todayKey();
    if (!state || state.date !== today) {
      state = { date: today, phaseIndex: 0, count: 0 };
    }
    return state;
  }

  function saveTasbihState(key, state) {
    var all = {};
    try { all = JSON.parse(localStorage.getItem("nc_tasbih_counts") || "{}"); } catch (e) { all = {}; }
    all[key] = state;
    localStorage.setItem("nc_tasbih_counts", JSON.stringify(all));
  }

  function vibrateSafe(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* no-op */ }
  }

  function pulseCircle(circle) {
    circle.classList.remove("tasbih-pulse");
    void circle.offsetWidth;
    circle.classList.add("tasbih-pulse");
  }

  function buildTasbihCounter(key, config) {
    var state = loadTasbihState(key);
    var wrap = document.createElement("div");
    wrap.className = "tasbih-counter";

    function resetState() {
      state = { date: todayKey(), phaseIndex: 0, count: 0 };
      saveTasbihState(key, state);
      render();
    }

    function render() {
      wrap.innerHTML = "";

      if (config.mode === "phases" && state.phaseIndex >= config.phases.length) {
        var doneText = document.createElement("p");
        doneText.className = "tasbih-done-text";
        doneText.textContent = "✓ Completed";
        wrap.appendChild(doneText);
        var startOver = document.createElement("button");
        startOver.type = "button";
        startOver.className = "tasbih-reset-link";
        startOver.textContent = "Start again";
        startOver.addEventListener("click", resetState);
        wrap.appendChild(startOver);
        return;
      }

      var phase = config.mode === "phases" ? config.phases[state.phaseIndex] : null;
      var target = phase ? phase.target : null;

      if (phase) {
        var label = document.createElement("div");
        label.className = "tasbih-phase-label";
        label.textContent = phase.label + " (" + (state.phaseIndex + 1) + "/" + config.phases.length + ")";
        wrap.appendChild(label);
      }

      var circle = document.createElement("button");
      circle.type = "button";
      circle.className = "tasbih-tap-circle" + (target ? "" : " tasbih-tap-circle-free");
      if (target) {
        var pct = Math.min(100, Math.round((state.count / target) * 100));
        circle.style.background = "conic-gradient(var(--mint) " + pct + "%, var(--surface-2) " + pct + "%)";
      }
      var num = document.createElement("span");
      num.className = "tasbih-count-num";
      num.textContent = state.count;
      circle.appendChild(num);
      if (target) {
        var targetSpan = document.createElement("span");
        targetSpan.className = "tasbih-count-target";
        targetSpan.textContent = "/" + target;
        circle.appendChild(targetSpan);
      }
      circle.addEventListener("click", function () {
        state.count++;
        pulseCircle(circle);
        if (target && state.count >= target) {
          vibrateSafe([15, 40, 15]);
          state.phaseIndex++;
          state.count = 0;
        } else {
          vibrateSafe(10);
        }
        saveTasbihState(key, state);
        render();
      });
      wrap.appendChild(circle);

      var controls = document.createElement("div");
      controls.className = "tasbih-controls";
      var reset = document.createElement("button");
      reset.type = "button";
      reset.className = "tasbih-reset-link";
      reset.textContent = "Reset";
      reset.addEventListener("click", function (e) {
        e.stopPropagation();
        resetState();
      });
      controls.appendChild(reset);
      wrap.appendChild(controls);
    }

    render();
    return wrap;
  }

  function buildSunnahItemDetail(items, actionId) {
    var detail = document.createElement("div");
    detail.className = "sunnah-item-detail hidden";
    items.forEach(function (entry, idx) {
      if (idx > 0) {
        var divider = document.createElement("div");
        divider.className = "sunnah-item-divider";
        detail.appendChild(divider);
      }
      if (entry.ruku) {
        var rukuBadge = document.createElement("p");
        rukuBadge.className = "sunnah-item-ruku";
        rukuBadge.textContent = "Ruku " + entry.ruku;
        detail.appendChild(rukuBadge);
      }

      var arabic = document.createElement("p");
      arabic.className = "sunnah-item-arabic";
      arabic.dir = "rtl";
      arabic.lang = "ar";
      arabic.textContent = entry.arabic;
      detail.appendChild(arabic);

      if (entry.transliteration) {
        var translit = document.createElement("p");
        translit.className = "dua-translit";
        translit.textContent = entry.transliteration;
        detail.appendChild(translit);
      }
      var meaning = document.createElement("p");
      meaning.className = "dua-meaning";
      meaning.textContent = entry.meaning;
      detail.appendChild(meaning);

      var source = document.createElement("p");
      source.className = "hadith-source";
      source.textContent = "Source: " + entry.source;
      detail.appendChild(source);

      if (entry.tasbih) {
        detail.appendChild(buildTasbihCounter(actionId + "-" + idx, entry.tasbih));
      }
    });
    return detail;
  }

  function buildSunnahItem(action, log) {
    var wrap = document.createElement("div");
    wrap.className = "sunnah-item-wrap";

    var item = document.createElement("div");
    item.className = "habit-item";
    var name = document.createElement("span");
    name.className = "name";
    name.textContent = action.name;
    var done = !!log[action.id];
    var toggle = document.createElement("button");
    toggle.className = "habit-toggle" + (done ? " done" : "");
    toggle.textContent = done ? "Done" : "Mark done";
    toggle.addEventListener("click", function () {
      toggleSunnahAction(action.id);
      renderRoutine();
      renderAkhlaq();
    });
    item.appendChild(name);

    if (action.items && action.items.length) {
      var expandBtn = document.createElement("button");
      expandBtn.className = "sunnah-item-expand-btn";
      var isOpen = !!sunnahItemExpandState[action.id];
      expandBtn.textContent = isOpen ? "Hide" : "Source";
      expandBtn.addEventListener("click", function () {
        sunnahItemExpandState[action.id] = !sunnahItemExpandState[action.id];
        renderRoutine();
        renderAkhlaq();
      });
      item.appendChild(expandBtn);
    }

    if (action.link && action.link.subtab) {
      var linkBtn = document.createElement("button");
      linkBtn.className = "sunnah-item-expand-btn";
      linkBtn.textContent = action.link.label || "Open";
      linkBtn.addEventListener("click", function () {
        switchSunnahSubtab(action.link.subtab);
        if (action.link.surah) openQuranSurah(action.link.surah);
      });
      item.appendChild(linkBtn);
    }

    item.appendChild(toggle);
    wrap.appendChild(item);

    if (action.items && action.items.length) {
      var detail = buildSunnahItemDetail(action.items, action.id);
      if (sunnahItemExpandState[action.id]) detail.classList.remove("hidden");
      wrap.appendChild(detail);
    }

    return wrap;
  }

  function buildRoutineSection(section, log) {
    var wrap = document.createElement("div");
    var isOpen = !!sunnahSectionOpenState[section.id];
    wrap.className = "sunnah-section" + (isOpen ? " open" : "");

    var doneCount = section.actions.reduce(function (sum, a) {
      return sum + (log[a.id] ? 1 : 0);
    }, 0);

    var header = document.createElement("button");
    header.className = "sunnah-section-header";
    header.type = "button";

    var titleWrap = document.createElement("div");
    titleWrap.className = "sunnah-section-title";
    var h3 = document.createElement("h3");
    h3.textContent = section.title;
    var badge = document.createElement("span");
    badge.className = "count-badge";
    badge.textContent = doneCount + " of " + section.actions.length;
    titleWrap.appendChild(h3);
    titleWrap.appendChild(badge);

    var chevron = document.createElement("span");
    chevron.className = "sunnah-section-chevron";
    chevron.textContent = "›";
    chevron.setAttribute("aria-hidden", "true");

    header.appendChild(titleWrap);
    header.appendChild(chevron);
    header.addEventListener("click", function () {
      sunnahSectionOpenState[section.id] = !sunnahSectionOpenState[section.id];
      renderRoutine();
    });

    var body = document.createElement("div");
    body.className = "sunnah-section-body" + (isOpen ? "" : " hidden");
    section.actions.forEach(function (action) {
      body.appendChild(buildSunnahItem(action, log));
    });

    wrap.appendChild(header);
    wrap.appendChild(body);
    return wrap;
  }

  function renderRoutine() {
    document.getElementById("sunnah-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    var log = getDaySunnahLog(todayKey());
    var wrap = document.getElementById("routine-sections");
    wrap.innerHTML = "";
    ROUTINE_SECTIONS.forEach(function (section) {
      wrap.appendChild(buildRoutineSection(section, log));
    });
  }

  function renderAkhlaq() {
    var log = getDaySunnahLog(todayKey());
    var list = document.getElementById("akhlaq-list");
    list.innerHTML = "";
    AKHLAQ_ITEMS.forEach(function (a) {
      list.appendChild(buildSunnahItem(a, log));
    });
  }

  function switchSunnahSubtab(subtabId) {
    var buttons = document.querySelectorAll("#sunnah-subtabs .subtab");
    var targetPanel = document.getElementById("sunnah-panel-" + subtabId);
    if (!targetPanel) return;
    buttons.forEach(function (b) {
      b.classList.toggle("active", b.dataset.subtab === subtabId);
    });
    document.querySelectorAll(".sunnah-panel").forEach(function (p) { p.classList.add("hidden"); });
    targetPanel.classList.remove("hidden");
    targetPanel.scrollIntoView({ block: "start" });
  }

  function initSunnahSubtabs() {
    var buttons = document.querySelectorAll("#sunnah-subtabs .subtab");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchSunnahSubtab(btn.dataset.subtab);
      });
    });
  }

  // ---------- DUAS ----------

  var duasState = { view: "categories", categoryId: null, duaId: null };

  function getDuaFavorites() {
    return readJSON("nc_dua_favorites", []);
  }

  function toggleDuaFavorite(duaId) {
    var favs = getDuaFavorites();
    var idx = favs.indexOf(duaId);
    if (idx === -1) favs.push(duaId); else favs.splice(idx, 1);
    writeJSON("nc_dua_favorites", favs);
  }

  function duasByCategory(categoryId) {
    return window.NURA_DUAS.duas.filter(function (d) { return d.categoryId === categoryId; });
  }

  function setDuasView(view) {
    duasState.view = view;
    ["categories", "list", "detail"].forEach(function (v) {
      document.getElementById("duas-" + v + "-view").classList.toggle("hidden", v !== view);
    });
    document.getElementById("duas-search-results-view").classList.add("hidden");
    document.getElementById("duas-back-row").classList.toggle("hidden", view === "categories");
  }

  function renderDuaCategories() {
    var grid = document.getElementById("dua-category-grid");
    grid.innerHTML = "";
    window.NURA_DUAS.categories.forEach(function (cat) {
      var count = duasByCategory(cat.id).length;
      var card = document.createElement("button");
      card.className = "dua-category-card" + (count === 0 ? " empty" : "");
      card.innerHTML = '<span class="cat-name">' + cat.name + '</span><span class="cat-count">' + (count === 0 ? "Pending verified content" : (count + (count === 1 ? " dua" : " duas"))) + '</span>';
      card.addEventListener("click", function () {
        duasState.categoryId = cat.id;
        renderDuaList(cat.id);
        setDuasView("list");
      });
      grid.appendChild(card);
    });
  }

  function buildDuaListItem(dua) {
    var favs = getDuaFavorites();
    var item = document.createElement("button");
    item.className = "dua-list-item";
    var textWrap = document.createElement("span");
    var title = document.createElement("span");
    title.className = "dua-list-title";
    title.textContent = dua.title;
    var catName = (window.NURA_DUAS.categories.find(function (c) { return c.id === dua.categoryId; }) || {}).name || "";
    var catLine = document.createElement("span");
    catLine.className = "dua-list-cat";
    catLine.textContent = catName;
    textWrap.appendChild(title);
    textWrap.appendChild(catLine);
    var fav = document.createElement("span");
    fav.className = "dua-list-fav";
    fav.textContent = favs.indexOf(dua.id) !== -1 ? "★" : "☆";
    item.appendChild(textWrap);
    item.appendChild(fav);
    item.addEventListener("click", function () {
      duasState.duaId = dua.id;
      renderDuaDetail(dua.id);
      setDuasView("detail");
    });
    return item;
  }

  function renderDuaList(categoryId) {
    var cat = window.NURA_DUAS.categories.find(function (c) { return c.id === categoryId; });
    document.getElementById("duas-list-title").textContent = cat ? cat.name : "";
    var list = document.getElementById("dua-list");
    list.innerHTML = "";
    var duas = duasByCategory(categoryId);
    if (!duas.length) {
      var empty = document.createElement("p");
      empty.className = "dua-empty-state";
      empty.textContent = "No verified duas in this category yet. The structure is ready — content will be added once a reliable source is verified.";
      list.appendChild(empty);
      return;
    }
    duas.forEach(function (d) { list.appendChild(buildDuaListItem(d)); });
  }

  function renderDuaDetail(duaId) {
    var dua = window.NURA_DUAS.duas.find(function (d) { return d.id === duaId; });
    if (!dua) return;
    document.getElementById("dua-detail-source").textContent = dua.source;
    document.getElementById("dua-detail-title").textContent = dua.title;
    document.getElementById("dua-detail-arabic").textContent = dua.arabic;
    document.getElementById("dua-detail-translit").textContent = dua.transliteration;
    document.getElementById("dua-detail-meaning").textContent = dua.meaning;
    var favBtn = document.getElementById("dua-detail-fav");
    var isFav = getDuaFavorites().indexOf(dua.id) !== -1;
    favBtn.classList.toggle("active", isFav);
    favBtn.onclick = function () {
      toggleDuaFavorite(dua.id);
      renderDuaDetail(dua.id);
    };
    document.getElementById("dua-copy-btn").onclick = function () {
      var text = dua.title + "\n\n" + dua.arabic + "\n\n" + dua.transliteration + "\n\n" + dua.meaning + "\n\nSource: " + dua.source;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showToast("Copied");
        }).catch(function () {
          showToast("Couldn't copy on this device");
        });
      } else {
        showToast("Copy not supported on this device");
      }
    };
    document.getElementById("dua-share-btn").onclick = function () {
      var text = dua.title + "\n\n" + dua.arabic + "\n\n" + dua.transliteration + "\n\n" + dua.meaning + "\n\nSource: " + dua.source;
      if (navigator.share) {
        navigator.share({ title: dua.title, text: text }).catch(function () {});
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { showToast("Sharing not available — copied instead"); });
      } else {
        showToast("Sharing not available on this device");
      }
    };
  }

  function renderDuaSearch(query) {
    var favOnly = document.getElementById("duas-favorites-toggle").getAttribute("aria-pressed") === "true";
    var favs = getDuaFavorites();
    var q = query.trim().toLowerCase();
    var results = window.NURA_DUAS.duas.filter(function (d) {
      if (favOnly && favs.indexOf(d.id) === -1) return false;
      if (!q) return favOnly;
      var cat = window.NURA_DUAS.categories.find(function (c) { return c.id === d.categoryId; });
      var hay = (d.title + " " + d.meaning + " " + d.transliteration + " " + (cat ? cat.name : "")).toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    document.getElementById("duas-categories-view").classList.add("hidden");
    document.getElementById("duas-list-view").classList.add("hidden");
    document.getElementById("duas-detail-view").classList.add("hidden");
    document.getElementById("duas-back-row").classList.add("hidden");
    document.getElementById("duas-search-results-view").classList.remove("hidden");

    var wrap = document.getElementById("dua-search-results");
    wrap.innerHTML = "";
    if (!results.length) {
      var empty = document.createElement("p");
      empty.className = "dua-empty-state";
      empty.textContent = favOnly && !q ? "No favorites yet — tap the star on any dua to save it here." : "No duas match your search.";
      wrap.appendChild(empty);
      return;
    }
    results.forEach(function (d) { wrap.appendChild(buildDuaListItem(d)); });
  }

  function initDuasUI() {
    document.getElementById("duas-back-btn").addEventListener("click", function () {
      var input = document.getElementById("duas-search-input");
      input.value = "";
      document.getElementById("duas-favorites-toggle").setAttribute("aria-pressed", "false");
      if (duasState.view === "detail") {
        renderDuaList(duasState.categoryId);
        setDuasView("list");
      } else {
        renderDuaCategories();
        setDuasView("categories");
      }
    });

    var searchInput = document.getElementById("duas-search-input");
    var favToggle = document.getElementById("duas-favorites-toggle");

    function updateFromSearch() {
      var q = searchInput.value;
      var favOn = favToggle.getAttribute("aria-pressed") === "true";
      if (q.trim() || favOn) {
        renderDuaSearch(q);
      } else {
        renderDuaCategories();
        setDuasView("categories");
      }
    }

    searchInput.addEventListener("input", updateFromSearch);
    favToggle.addEventListener("click", function () {
      var pressed = favToggle.getAttribute("aria-pressed") === "true";
      favToggle.setAttribute("aria-pressed", pressed ? "false" : "true");
      updateFromSearch();
    });

    renderDuaCategories();
  }

  // ---------- VAULT ----------
  // Real encryption: AES-GCM 256 via Web Crypto SubtleCrypto, key derived
  // from the user's passphrase with PBKDF2 (150,000 iterations, SHA-256).
  // The passphrase itself is never stored; the derived key lives only in
  // memory for the current unlocked session (module-level var below), never
  // in localStorage. Not independently security-audited — labeled as such
  // in the Vault settings screen. See CLAUDE.md Section 9 / docs/decisions.md.

  var VAULT_SECTIONS = [
    { id: "hamdard", name: "Hamdard / Private Reflection" },
    { id: "triggers", name: "Trigger & Struggle Notes" },
    { id: "career", name: "Career Audit" },
    { id: "principles", name: "My Personal Code / Principles" }
  ];

  var vaultKey = null;              // CryptoKey, memory-only
  var vaultDecrypted = null;        // [{id, section, title, body, createdAt, updatedAt}], memory-only
  var vaultState = { view: "checking", sectionId: null, entryId: null, editingId: null };

  function hasWebCrypto() {
    return !!(window.crypto && window.crypto.subtle);
  }

  function bufToBase64(buf) {
    var bytes = new Uint8Array(buf);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function base64ToBuf(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function getVaultMeta() {
    return readJSON("nc_vault_meta", null);
  }

  function getVaultEntriesRaw() {
    return readJSON("nc_vault_entries", []);
  }

  function saveVaultEntriesRaw(entries) {
    writeJSON("nc_vault_entries", entries);
  }

  function deriveVaultKey(passphrase, saltB64) {
    var enc = new TextEncoder();
    var salt = base64ToBuf(saltB64);
    return window.crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"])
      .then(function (keyMaterial) {
        return window.crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: salt, iterations: 150000, hash: "SHA-256" },
          keyMaterial,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );
      });
  }

  function vaultEncrypt(key, plaintext) {
    var iv = window.crypto.getRandomValues(new Uint8Array(12));
    var enc = new TextEncoder();
    return window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(plaintext))
      .then(function (cipherBuf) {
        return { iv: bufToBase64(iv), data: bufToBase64(cipherBuf) };
      });
  }

  function vaultDecrypt(key, ivB64, dataB64) {
    var iv = base64ToBuf(ivB64);
    var data = base64ToBuf(dataB64);
    return window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data)
      .then(function (plainBuf) {
        return new TextDecoder().decode(plainBuf);
      });
  }

  function createVault(passphrase) {
    var salt = window.crypto.getRandomValues(new Uint8Array(16));
    var saltB64 = bufToBase64(salt);
    return deriveVaultKey(passphrase, saltB64).then(function (key) {
      return vaultEncrypt(key, "nura-vault-ok").then(function (check) {
        writeJSON("nc_vault_meta", { salt: saltB64, checkIv: check.iv, checkData: check.data, createdAt: Date.now() });
        vaultKey = key;
        vaultDecrypted = [];
        return true;
      });
    });
  }

  function unlockVault(passphrase) {
    var meta = getVaultMeta();
    if (!meta) return Promise.reject(new Error("no-vault"));
    var derivedKey;
    return deriveVaultKey(passphrase, meta.salt)
      .then(function (key) {
        derivedKey = key;
        return vaultDecrypt(key, meta.checkIv, meta.checkData);
      })
      .catch(function () {
        // Wrong passphrase produces an AES-GCM auth failure here — that's
        // the only place a bad passphrase should be reported from. A later
        // failure decrypting an individual entry is a different problem
        // (e.g. leftover data from a different key) and must not be
        // reported as "wrong passphrase" — see per-entry catch below.
        throw new Error("wrong-passphrase");
      })
      .then(function (plain) {
        if (plain !== "nura-vault-ok") throw new Error("wrong-passphrase");
        vaultKey = derivedKey;
        var raw = getVaultEntriesRaw();
        return Promise.all(raw.map(function (e) {
          return Promise.all([
            vaultDecrypt(derivedKey, e.titleIv, e.titleData),
            vaultDecrypt(derivedKey, e.bodyIv, e.bodyData)
          ]).then(function (parts) {
            return { id: e.id, section: e.section, title: parts[0], body: parts[1], createdAt: e.createdAt, updatedAt: e.updatedAt };
          }).catch(function () {
            return null; // skip an entry that can't be decrypted rather than failing the whole unlock
          });
        })).then(function (entries) {
          vaultDecrypted = entries.filter(function (e) { return e !== null; });
          return true;
        });
      });
  }

  function lockVault() {
    vaultKey = null;
    vaultDecrypted = null;
  }

  function saveVaultEntry(section, title, body, editingId) {
    return Promise.all([vaultEncrypt(vaultKey, title || "Untitled"), vaultEncrypt(vaultKey, body)]).then(function (parts) {
      var raw = getVaultEntriesRaw();
      var now = Date.now();
      if (editingId) {
        raw = raw.map(function (e) {
          if (e.id !== editingId) return e;
          return { id: e.id, section: section, titleIv: parts[0].iv, titleData: parts[0].data, bodyIv: parts[1].iv, bodyData: parts[1].data, createdAt: e.createdAt, updatedAt: now };
        });
        vaultDecrypted = vaultDecrypted.map(function (e) {
          if (e.id !== editingId) return e;
          return { id: e.id, section: section, title: title || "Untitled", body: body, createdAt: e.createdAt, updatedAt: now };
        });
      } else {
        var id = uid("v");
        raw.push({ id: id, section: section, titleIv: parts[0].iv, titleData: parts[0].data, bodyIv: parts[1].iv, bodyData: parts[1].data, createdAt: now, updatedAt: now });
        vaultDecrypted.push({ id: id, section: section, title: title || "Untitled", body: body, createdAt: now, updatedAt: now });
      }
      saveVaultEntriesRaw(raw);
    });
  }

  function deleteVaultEntry(id) {
    saveVaultEntriesRaw(getVaultEntriesRaw().filter(function (e) { return e.id !== id; }));
    vaultDecrypted = vaultDecrypted.filter(function (e) { return e.id !== id; });
  }

  function clearVaultCompletely() {
    localStorage.removeItem("nc_vault_meta");
    localStorage.removeItem("nc_vault_entries");
    vaultKey = null;
    vaultDecrypted = null;
  }

  function vaultEntriesBySection(sectionId) {
    return (vaultDecrypted || []).filter(function (e) { return e.section === sectionId; })
      .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }

  function showVaultScreen(screenId) {
    document.querySelectorAll(".vault-screen").forEach(function (el) { el.classList.add("hidden"); });
    document.getElementById(screenId).classList.remove("hidden");
  }

  function renderVaultRoot() {
    if (!hasWebCrypto()) {
      showVaultScreen("vault-locked");
      document.getElementById("vault-locked").innerHTML = '<section class="card"><p class="pending-note">This browser does not support the Web Crypto API needed for real encryption, so Vault cannot safely open here. Try a modern browser (recent Chrome, Firefox, Safari, or Edge).</p></section>';
      return;
    }
    var meta = getVaultMeta();
    if (!meta) {
      vaultState.view = "setup";
      showVaultScreen("vault-setup");
    } else if (!vaultKey) {
      vaultState.view = "locked";
      showVaultScreen("vault-locked");
      document.getElementById("vault-unlock-pass").value = "";
      document.getElementById("vault-unlock-error").classList.add("hidden");
    } else {
      vaultState.view = "home";
      renderVaultHome();
      showVaultScreen("vault-home");
    }
  }

  function renderVaultHome() {
    document.getElementById("vault-search-input").value = "";
    document.getElementById("vault-search-results-wrap").classList.add("hidden");
    document.getElementById("vault-section-grid-wrap").classList.remove("hidden");
    var grid = document.getElementById("vault-section-grid");
    grid.innerHTML = "";
    VAULT_SECTIONS.forEach(function (sec) {
      var count = vaultEntriesBySection(sec.id).length;
      var card = document.createElement("button");
      card.className = "dua-category-card";
      card.innerHTML = '<span class="cat-name">' + sec.name + '</span><span class="cat-count">' + count + (count === 1 ? " entry" : " entries") + '</span>';
      card.addEventListener("click", function () {
        vaultState.sectionId = sec.id;
        renderVaultSection(sec.id);
        showVaultScreen("vault-section-view");
      });
      grid.appendChild(card);
    });
  }

  function buildVaultEntryItem(entry) {
    var sec = VAULT_SECTIONS.find(function (s) { return s.id === entry.section; });
    var item = document.createElement("button");
    item.className = "dua-list-item";
    var textWrap = document.createElement("span");
    var title = document.createElement("span");
    title.className = "dua-list-title";
    title.textContent = entry.title;
    var preview = document.createElement("span");
    preview.className = "vault-entry-preview";
    preview.textContent = (entry.body || "").slice(0, 60) + (entry.body && entry.body.length > 60 ? "…" : "");
    var dateLine = document.createElement("span");
    dateLine.className = "vault-entry-date";
    dateLine.textContent = new Date(entry.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + (sec && vaultState.view !== "section" ? " · " + sec.name : "");
    textWrap.appendChild(title);
    textWrap.appendChild(preview);
    textWrap.appendChild(document.createElement("br"));
    textWrap.appendChild(dateLine);
    item.appendChild(textWrap);
    item.addEventListener("click", function () {
      vaultState.entryId = entry.id;
      renderVaultDetail(entry.id);
      showVaultScreen("vault-entry-detail");
    });
    return item;
  }

  function renderVaultSection(sectionId) {
    var sec = VAULT_SECTIONS.find(function (s) { return s.id === sectionId; });
    document.getElementById("vault-section-title").textContent = sec ? sec.name : "";
    var list = document.getElementById("vault-entry-list");
    list.innerHTML = "";
    var entries = vaultEntriesBySection(sectionId);
    if (!entries.length) {
      var empty = document.createElement("p");
      empty.className = "dua-empty-state";
      empty.textContent = "No entries yet. Tap “+ New” to write your first one.";
      list.appendChild(empty);
      return;
    }
    entries.forEach(function (e) { list.appendChild(buildVaultEntryItem(e)); });
  }

  function renderVaultDetail(entryId) {
    var entry = (vaultDecrypted || []).find(function (e) { return e.id === entryId; });
    if (!entry) return;
    document.getElementById("vault-detail-title").textContent = entry.title;
    document.getElementById("vault-detail-body").textContent = entry.body;
    var updated = new Date(entry.updatedAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    document.getElementById("vault-detail-date").textContent = "Last updated " + updated;
  }

  function openVaultEntryForm(sectionId, editingEntry) {
    vaultState.editingId = editingEntry ? editingEntry.id : null;
    document.getElementById("vault-entry-title-input").value = editingEntry ? editingEntry.title : "";
    document.getElementById("vault-entry-body-input").value = editingEntry ? editingEntry.body : "";
    vaultState.sectionId = sectionId;
    showVaultScreen("vault-entry-form");
  }

  function initVault() {
    document.getElementById("vault-setup-create").addEventListener("click", function () {
      var pass = document.getElementById("vault-setup-pass").value;
      var confirm = document.getElementById("vault-setup-confirm").value;
      var errEl = document.getElementById("vault-setup-error");
      errEl.classList.add("hidden");
      if (!pass || pass.length < 4) {
        errEl.textContent = "Passphrase must be at least 4 characters.";
        errEl.classList.remove("hidden");
        return;
      }
      if (pass !== confirm) {
        errEl.textContent = "Passphrases don't match.";
        errEl.classList.remove("hidden");
        return;
      }
      createVault(pass).then(function () {
        document.getElementById("vault-setup-pass").value = "";
        document.getElementById("vault-setup-confirm").value = "";
        renderVaultRoot();
        showToast("Vault created");
      });
    });

    document.getElementById("vault-unlock-btn").addEventListener("click", function () {
      var pass = document.getElementById("vault-unlock-pass").value;
      var errEl = document.getElementById("vault-unlock-error");
      errEl.classList.add("hidden");
      unlockVault(pass).then(function () {
        renderVaultRoot();
      }).catch(function () {
        errEl.textContent = "Incorrect passphrase.";
        errEl.classList.remove("hidden");
      });
    });

    document.getElementById("vault-forgot-btn").addEventListener("click", function () {
      showVaultScreen("vault-forgot");
    });
    document.getElementById("vault-forgot-back-btn").addEventListener("click", function () {
      showVaultScreen("vault-locked");
    });
    document.getElementById("vault-forgot-erase-btn").addEventListener("click", function () {
      var confirmed = window.confirm("This permanently erases your Vault and every entry inside it. This cannot be undone. Continue?");
      if (!confirmed) return;
      clearVaultCompletely();
      renderVaultRoot();
      showToast("Vault erased");
    });

    document.getElementById("vault-lock-btn").addEventListener("click", function () {
      lockVault();
      renderVaultRoot();
    });

    document.getElementById("vault-section-back").addEventListener("click", function () {
      renderVaultHome();
      showVaultScreen("vault-home");
    });

    document.getElementById("vault-new-entry-btn").addEventListener("click", function () {
      openVaultEntryForm(vaultState.sectionId, null);
    });

    document.getElementById("vault-form-back").addEventListener("click", function () {
      if (vaultState.sectionId) {
        renderVaultSection(vaultState.sectionId);
        showVaultScreen("vault-section-view");
      } else {
        renderVaultHome();
        showVaultScreen("vault-home");
      }
    });

    document.getElementById("vault-entry-save-btn").addEventListener("click", function () {
      var title = document.getElementById("vault-entry-title-input").value.trim();
      var body = document.getElementById("vault-entry-body-input").value;
      if (!body.trim()) {
        showToast("Write something before saving");
        return;
      }
      saveVaultEntry(vaultState.sectionId, title, body, vaultState.editingId).then(function () {
        vaultState.editingId = null;
        renderVaultSection(vaultState.sectionId);
        showVaultScreen("vault-section-view");
        showToast("Saved");
      });
    });

    document.getElementById("vault-detail-back").addEventListener("click", function () {
      renderVaultSection(vaultState.sectionId);
      showVaultScreen("vault-section-view");
    });

    document.getElementById("vault-detail-edit").addEventListener("click", function () {
      var entry = (vaultDecrypted || []).find(function (e) { return e.id === vaultState.entryId; });
      if (entry) openVaultEntryForm(entry.section, entry);
    });

    document.getElementById("vault-detail-delete").addEventListener("click", function () {
      var confirmed = window.confirm("Delete this entry? This cannot be undone.");
      if (!confirmed) return;
      deleteVaultEntry(vaultState.entryId);
      renderVaultSection(vaultState.sectionId);
      showVaultScreen("vault-section-view");
      showToast("Entry deleted");
    });

    document.getElementById("vault-settings-open-btn").addEventListener("click", function () {
      document.getElementById("vault-change-current").value = "";
      document.getElementById("vault-change-new").value = "";
      document.getElementById("vault-change-confirm").value = "";
      document.getElementById("vault-change-error").classList.add("hidden");
      showVaultScreen("vault-settings-view");
    });
    document.getElementById("vault-settings-back").addEventListener("click", function () {
      renderVaultHome();
      showVaultScreen("vault-home");
    });

    document.getElementById("vault-change-btn").addEventListener("click", function () {
      var current = document.getElementById("vault-change-current").value;
      var next = document.getElementById("vault-change-new").value;
      var confirmNew = document.getElementById("vault-change-confirm").value;
      var errEl = document.getElementById("vault-change-error");
      errEl.classList.add("hidden");

      unlockVault(current).then(function () {
        if (!next || next.length < 4) {
          errEl.textContent = "New passphrase must be at least 4 characters.";
          errEl.classList.remove("hidden");
          return;
        }
        if (next !== confirmNew) {
          errEl.textContent = "New passphrases don't match.";
          errEl.classList.remove("hidden");
          return;
        }
        var entriesToReencrypt = vaultDecrypted.slice();
        return createVault(next).then(function () {
          // Old ciphertext was encrypted under the old key/salt and can
          // never be decrypted with the new key — clear it before writing
          // fresh entries, and do so one at a time (not Promise.all) since
          // saveVaultEntry does a read-modify-write on localStorage that
          // would race and drop entries if run in parallel.
          saveVaultEntriesRaw([]);
          var chain = Promise.resolve();
          entriesToReencrypt.forEach(function (e) {
            chain = chain.then(function () {
              return saveVaultEntry(e.section, e.title, e.body, null);
            });
          });
          return chain;
        }).then(function () {
          showToast("Passphrase changed");
          renderVaultRoot();
        });
      }).catch(function () {
        errEl.textContent = "Current passphrase is incorrect.";
        errEl.classList.remove("hidden");
      });
    });

    document.getElementById("vault-clear-btn").addEventListener("click", function () {
      var confirmed = window.confirm("This permanently deletes your passphrase and every Vault entry on this device. This cannot be undone. Continue?");
      if (!confirmed) return;
      clearVaultCompletely();
      renderVaultRoot();
      showToast("Vault cleared");
    });

    var vaultSearchInput = document.getElementById("vault-search-input");
    vaultSearchInput.addEventListener("input", function () {
      var q = vaultSearchInput.value.trim().toLowerCase();
      var resultsWrap = document.getElementById("vault-search-results-wrap");
      var gridWrap = document.getElementById("vault-section-grid-wrap");
      if (!q) {
        resultsWrap.classList.add("hidden");
        gridWrap.classList.remove("hidden");
        return;
      }
      gridWrap.classList.add("hidden");
      resultsWrap.classList.remove("hidden");
      var results = (vaultDecrypted || []).filter(function (e) {
        return (e.title + " " + e.body).toLowerCase().indexOf(q) !== -1;
      }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
      var list = document.getElementById("vault-search-results");
      list.innerHTML = "";
      if (!results.length) {
        var empty = document.createElement("p");
        empty.className = "dua-empty-state";
        empty.textContent = "No entries match your search.";
        list.appendChild(empty);
        return;
      }
      results.forEach(function (e) { list.appendChild(buildVaultEntryItem(e)); });
    });
  }

  // ---------- QURAN VERSE OF THE DAY ----------
  // Arabic text: verbatim from the Tanzil Project (tanzil.net), CC BY 3.0 —
  // attribution required, text must not be altered. No translation shown yet.

  var QURAN_DATA_URL = "assets/quran/quran-uthmani.txt";
  var quranVersesCache = null;
  var quranLoadPromise = null;

  function loadQuranVerses() {
    if (quranVersesCache) return Promise.resolve(quranVersesCache);
    if (quranLoadPromise) return quranLoadPromise;
    quranLoadPromise = fetch(QURAN_DATA_URL)
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var verses = [];
        text.split("\n").forEach(function (line) {
          var m = line.match(/^(\d+)\|(\d+)\|(.+)$/);
          if (m) verses.push({ surah: Number(m[1]), ayah: Number(m[2]), text: m[3].trim() });
        });
        quranVersesCache = verses;
        return verses;
      });
    return quranLoadPromise;
  }

  function getTodayVerseIndex(total) {
    var epoch = Date.UTC(2024, 0, 1);
    var daysSince = Math.floor((Date.now() - epoch) / 86400000);
    return ((daysSince % total) + total) % total;
  }

  function renderVerseOfDay() {
    var box = document.getElementById("verse-box");
    loadQuranVerses().then(function (verses) {
      if (!verses.length) return;
      var verse = verses[getTodayVerseIndex(verses.length)];
      var rukuText = (window.NURA_RUKU && window.NURA_RUKU.getRukuNumber)
        ? " · Ruku " + window.NURA_RUKU.getRukuNumber(verse.surah, verse.ayah)
        : "";
      document.getElementById("verse-ref").textContent = "Surah " + verse.surah + ":" + verse.ayah + rukuText;
      document.getElementById("verse-arabic").textContent = verse.text;
      box.classList.remove("hidden");
    }).catch(function () {
      box.classList.add("hidden");
    });
  }

  // ---------- FULL QURAN (surah browsing) ----------
  // Arabic: local, already-verified Tanzil file (loadQuranVerses above).
  // English (Saheeh International, resource 20) and Urdu (Maulana Muhammad
  // Junagarhi, resource 54) are fetched live per-surah from the Quran
  // Foundation's public, keyless legacy API (api.quran.com) — the same
  // source already verified and used for the Al-Baqarah 285-286 translation
  // and for ruku numbers. Translations are not bundled/stored in this repo;
  // they're fetched on demand each time a surah is opened, and need internet.

  var QURAN_TRANSLATION_RESOURCES = { en: 20, ur: 54 };
  var quranTranslationCache = {}; // "resourceId-surahNumber" -> array of strings
  var quranState = { view: "list", surahNumber: null };

  function stripTranslationMarkup(text) {
    return text.replace(/<sup[^>]*>.*?<\/sup>/gi, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }

  function fetchQuranTranslation(resourceId, surahNumber) {
    var key = resourceId + "-" + surahNumber;
    if (quranTranslationCache[key]) return Promise.resolve(quranTranslationCache[key]);
    return fetch("https://api.quran.com/api/v4/quran/translations/" + resourceId + "?chapter_number=" + surahNumber)
      .then(function (res) {
        if (!res.ok) throw new Error("translation fetch failed");
        return res.json();
      })
      .then(function (data) {
        var texts = (data.translations || []).map(function (t) { return stripTranslationMarkup(t.text); });
        quranTranslationCache[key] = texts;
        return texts;
      });
  }

  function renderQuranSurahList(filterText) {
    var list = document.getElementById("quran-surah-list");
    list.innerHTML = "";
    var filter = (filterText || "").trim().toLowerCase();
    var surahs = window.NURA_QURAN_SURAHS || [];
    surahs.filter(function (s) {
      if (!filter) return true;
      return s.nameSimple.toLowerCase().indexOf(filter) !== -1 ||
        s.nameTranslated.toLowerCase().indexOf(filter) !== -1 ||
        String(s.number) === filter;
    }).forEach(function (s) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "dua-list-item";
      row.innerHTML =
        '<span class="quran-surah-row">' +
          '<span class="quran-surah-num">' + s.number + '</span>' +
          '<span class="quran-surah-names">' +
            '<span class="dua-list-title">' + s.nameSimple + '</span>' +
            '<span class="dua-list-cat">' + s.nameTranslated + ' &middot; ' + s.versesCount + ' ayahs</span>' +
          '</span>' +
        '</span>' +
        '<span class="quran-surah-arabic-name">' + s.nameArabic + '</span>';
      row.addEventListener("click", function () { openQuranSurah(s.number); });
      list.appendChild(row);
    });
  }

  function openQuranSurah(number) {
    quranState.view = "detail";
    quranState.surahNumber = number;
    document.getElementById("quran-surah-list-view").classList.add("hidden");
    document.getElementById("quran-surah-detail-view").classList.remove("hidden");
    renderQuranSurahDetail();
    document.getElementById("quran-surah-detail-view").scrollIntoView({ block: "start" });
  }

  function closeQuranSurah() {
    quranState.view = "list";
    quranState.surahNumber = null;
    document.getElementById("quran-surah-detail-view").classList.add("hidden");
    document.getElementById("quran-surah-list-view").classList.remove("hidden");
  }

  function renderQuranSurahDetail() {
    var number = quranState.surahNumber;
    var meta = (window.NURA_QURAN_SURAHS || []).find(function (s) { return s.number === number; });
    var header = document.getElementById("quran-surah-header");
    var ayahList = document.getElementById("quran-ayah-list");
    if (!meta) return;

    header.innerHTML =
      '<div class="quran-surah-header-inner">' +
        '<div class="quran-surah-header-arabic">' + meta.nameArabic + '</div>' +
        '<h2 style="margin:2px 0;">' + meta.nameSimple + ' — ' + meta.nameTranslated + '</h2>' +
        '<div class="quran-surah-header-meta">Surah ' + meta.number + ' &middot; ' + meta.versesCount + ' ayahs &middot; ' + (meta.revelationPlace === "makkah" ? "Makki" : "Madani") + '</div>' +
      '</div>';

    ayahList.innerHTML = '<p class="quran-loading-note">Loading ayat and translations…</p>';

    Promise.all([
      loadQuranVerses(),
      fetchQuranTranslation(QURAN_TRANSLATION_RESOURCES.en, number),
      fetchQuranTranslation(QURAN_TRANSLATION_RESOURCES.ur, number)
    ]).then(function (results) {
      if (quranState.surahNumber !== number) return; // user navigated away before this resolved
      var allVerses = results[0];
      var enTexts = results[1];
      var urTexts = results[2];
      var surahVerses = allVerses.filter(function (v) { return v.surah === number; });

      ayahList.innerHTML = "";
      surahVerses.forEach(function (v, idx) {
        var rukuText = (window.NURA_RUKU && window.NURA_RUKU.getRukuNumber)
          ? "Ruku " + window.NURA_RUKU.getRukuNumber(v.surah, v.ayah)
          : "";
        var card = document.createElement("div");
        card.className = "quran-ayah-card";
        card.innerHTML =
          '<div class="quran-ayah-top">' +
            '<span class="quran-ayah-num">Ayah ' + v.ayah + '</span>' +
            '<span class="quran-ayah-ruku">' + rukuText + '</span>' +
          '</div>' +
          '<p class="quran-ayah-arabic">' + v.text + '</p>' +
          (enTexts[idx] ? '<p class="quran-ayah-translation"><span class="quran-ayah-translation-label">EN</span>' + enTexts[idx] + '</p>' : '') +
          (urTexts[idx] ? '<p class="quran-ayah-translation quran-ayah-urdu"><span class="quran-ayah-translation-label" style="direction:ltr;display:inline-block;">UR</span> ' + urTexts[idx] + '</p>' : '');
        ayahList.appendChild(card);
      });
    }).catch(function () {
      if (quranState.surahNumber !== number) return;
      ayahList.innerHTML = '<p class="quran-error-note">Could not load this surah. Check your internet connection and try again.</p>';
    });
  }

  function initQuranUI() {
    renderQuranSurahList("");
    document.getElementById("quran-surah-search").addEventListener("input", function (e) {
      renderQuranSurahList(e.target.value);
    });
    document.getElementById("quran-surah-back-btn").addEventListener("click", closeQuranSurah);
  }

  // ---------- HADITH & QUIZ ----------
  // Every hadith below was cross-checked against sunnah.com / named hadith
  // numbers before use (see docs/decisions.md) — none generated from memory.
  // Expanding this library further still needs a named content reviewer
  // before it ships widely (see CLAUDE.md Section 15).

  var HADITH_LIST = [
    {
    id: "hadith-1",
    title: "Actions Are Judged by Intentions",
    source: "Sahih al-Bukhari 1 · Sahih Muslim 1907 · 40 Hadith Nawawi 1 · narrated by Umar ibn al-Khattab",
    arabic: "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ",
    text: "Actions are judged by intentions, and every person will get what they intended.",
    explain: "This hadith is often placed first in hadith collections because it applies to everything a person does. Two people can do the same visible action for very different reasons — the intention behind it is what gives it its real weight.",
    quiz: {
      question: "According to this hadith, what determines the value of an action?",
      options: [
        "How large or visible the action is",
        "The intention behind it",
        "Whether other people noticed it"
      ],
      correctIndex: 1,
      feedback: "Right — the hadith says actions are judged by intentions, not by size or visibility."
    }
    },
    {
      id: "hadith-2",
      title: "The Believer's Affair Is All Good",
      source: "Sahih Muslim 2999, narrated by Suhayb",
      arabic: "عَجَبًا لأَمْرِ الْمُؤْمِنِ إِنَّ أَمْرَهُ كُلَّهُ خَيْرٌ وَلَيْسَ ذَاكَ لأَحَدٍ إِلاَّ لِلْمُؤْمِنِ إِنْ أَصَابَتْهُ سَرَّاءُ شَكَرَ فَكَانَ خَيْرًا لَهُ وَإِنْ أَصَابَتْهُ ضَرَّاءُ صَبَرَ فَكَانَ خَيْرًا لَهُ",
      text: "How wonderful is the affair of the believer — all of it is good, and this is for no one except the believer. If something good happens to him, he is grateful, and that is good for him. If something bad happens to him, he is patient, and that is good for him.",
      explain: "This hadith describes a mindset, not a magic escape from hardship. The believer still feels the good and the bad — the difference is what they do with each one: gratitude when things go well, patience when they don't. Both responses are framed as genuinely good for the person, not just a consolation.",
      quiz: {
        question: "According to this hadith, what makes a believer's affairs 'all good'?",
        options: [
          "Nothing bad ever happens to them",
          "They respond with gratitude in ease and patience in hardship",
          "They never feel sad or upset"
        ],
        correctIndex: 1,
        feedback: "Right — it's not the absence of hardship, it's the response: gratitude when things go well, patience when they don't."
      }
    },
    {
      id: "hadith-3",
      title: "The Company You Keep",
      source: "Sahih al-Bukhari 2101 / 5534, Sahih Muslim 2628, narrated by Abu Musa",
      arabic: "مَثَلُ الْجَلِيسِ الصَّالِحِ وَالْجَلِيسِ السَّوْءِ كَمَثَلِ صَاحِبِ الْمِسْكِ، وَكِيرِ الْحَدَّادِ، لاَ يَعْدَمُكَ مِنْ صَاحِبِ الْمِسْكِ إِمَّا تَشْتَرِيهِ، أَوْ تَجِدُ رِيحَهُ، وَكِيرُ الْحَدَّادِ يُحْرِقُ بَدَنَكَ أَوْ ثَوْبَكَ أَوْ تَجِدُ مِنْهُ رِيحًا خَبِيثَةً",
      text: "The example of a good companion and a bad companion is like a musk seller and a blacksmith's bellows: from the musk seller, you either buy some or at least catch its good scent; from the blacksmith's bellows, you either burn your clothes or at least catch a foul smell.",
      explain: "This is a practical, non-judgmental way to think about who you spend time with — not that bad people are worthless, but that closeness rubs off on you either way, for better or worse, even without meaning to.",
      quiz: {
        question: "In this hadith, what does a good companion get compared to?",
        options: [
          "A teacher",
          "A musk seller",
          "A blacksmith's bellows"
        ],
        correctIndex: 1,
        feedback: "Right — a good companion is compared to a musk seller, who leaves you better off just by being near them."
      }
    },
    {
      id: "hadith-4",
      title: "Faith Includes the Small Things",
      source: "Sahih Muslim 35, narrated by Abu Hurairah",
      arabic: "الْإِيمَانُ بِضْعٌ وَسَبْعُونَ أَوْ بِضْعٌ وَسِتُّونَ شُعْبَةً فَأَفْضَلُهَا قَوْلُ لَا إِلَهَ إِلَّا اللَّهُ وَأَدْنَاهَا إِمَاطَةُ الْأَذَى عَنِ الطَّرِيقِ",
      text: "Faith has sixty-some or seventy-some branches. The best of them is saying 'there is no god but Allah,' and the least of them is removing something harmful from the road.",
      explain: "This hadith places the biggest statement of belief and a small act of everyday courtesy on the same scale — both count as faith. It pushes back on the idea that only big, visible acts of worship matter; small, practical good is part of the same thing.",
      quiz: {
        question: "According to this hadith, what is given as an example of the least (smallest) branch of faith?",
        options: [
          "Fasting extra days",
          "Removing something harmful from the road",
          "Praying extra prayers at night"
        ],
        correctIndex: 1,
        feedback: "Right — even a small, practical act like clearing something harmful off a path counts as a branch of faith."
      }
    },
    {
      id: "hadith-5",
      title: "Wanting for Others What You Want for Yourself",
      source: "Sahih al-Bukhari 13, Sahih Muslim 45",
      arabic: "لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لِأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ",
      text: "None of you truly believes until he loves for his brother what he loves for himself.",
      explain: "This hadith sets a personal, practical test rather than an abstract rule: before acting, ask whether you'd want the same treatment if the roles were reversed. It's simple to say and genuinely hard to live by consistently.",
      quiz: {
        question: "According to this hadith, what does complete faith require toward other people?",
        options: [
          "Agreeing with them on everything",
          "Wanting for them what you want for yourself",
          "Giving them money regularly"
        ],
        correctIndex: 1,
        feedback: "Right — it's about wanting the same good for others that you want for yourself, not agreement or charity specifically."
      }
    },
    {
      id: "hadith-6",
      title: "Small and Steady Beats Big and Occasional",
      source: "Sahih al-Bukhari 6464, narrated by 'Aishah",
      arabic: "سَدِّدُوا وَقَارِبُوا، وَاعْلَمُوا أَنْ لَنْ يُدْخِلَ أَحَدَكُمْ عَمَلُهُ الْجَنَّةَ، وَأَنَّ أَحَبَّ الأَعْمَالِ أَدْوَمُهَا إِلَى اللَّهِ، وَإِنْ قَلَّ",
      text: "Aim straight, and stay close to what is right. Know that none of you will enter Paradise by his deeds alone, and the most beloved of deeds to Allah are those done most consistently, even if small.",
      explain: "This directly pushes back on the idea that a good habit only counts if it's big or impressive. A small action repeated steadily is described as more beloved than an intense burst that doesn't last — useful to remember when a task on Home or a Sunnah item feels too small to bother with.",
      quiz: {
        question: "According to this hadith, which kind of deed does Allah love most?",
        options: [
          "The biggest, most impressive one",
          "One done consistently, even if small",
          "One done only once, done perfectly"
        ],
        correctIndex: 1,
        feedback: "Right — consistency is valued over size or intensity."
      }
    },
    {
      id: "hadith-7",
      title: "Gentleness Is Not Optional",
      source: "Sahih Muslim 2592, narrated by Jarir",
      arabic: "مَنْ يُحْرَمِ الرِّفْقَ يُحْرَمِ الْخَيْرَ",
      text: "Whoever is deprived of gentleness is deprived of goodness.",
      explain: "Gentleness here isn't framed as a nice extra — it's tied directly to goodness itself. Someone who never approaches things gently, with people or with themselves, is missing something real, not just being 'a bit harsh.'",
      quiz: {
        question: "According to this hadith, what happens to someone who lacks gentleness?",
        options: [
          "They become more respected",
          "They are deprived of goodness",
          "Nothing — gentleness doesn't matter much"
        ],
        correctIndex: 1,
        feedback: "Right — the hadith ties gentleness directly to goodness, not as a minor virtue."
      }
    },
    {
      id: "hadith-8",
      title: "What Real Richness Is",
      source: "Sahih al-Bukhari 6446, Sahih Muslim 1051, narrated by Abu Hurairah",
      arabic: "لَيْسَ الْغِنَى عَنْ كَثْرَةِ الْعَرَضِ، وَلَكِنَّ الْغِنَى غِنَى النَّفْسِ",
      text: "Richness is not about having many possessions; real richness is the richness of the soul.",
      explain: "This separates two things people often mix up: how much someone owns, and whether they're actually content. It doesn't say money is bad — it says money alone doesn't make someone rich in any way that matters if the person inside is never satisfied.",
      quiz: {
        question: "According to this hadith, what is true richness?",
        options: [
          "Having a lot of possessions",
          "Being well known",
          "Contentment of the soul"
        ],
        correctIndex: 2,
        feedback: "Right — the hadith defines real richness as contentment, not the amount you own."
      }
    }
  ];

  var hadithState = { currentId: null };

  function getHadithProgress() {
    return readJSON("nc_hadith_progress", {});
  }

  function saveHadithProgress(p) {
    writeJSON("nc_hadith_progress", p);
  }

  function getCoins() {
    return readJSON("nc_coins", 0);
  }

  function addCoins(n) {
    writeJSON("nc_coins", getCoins() + n);
  }

  function currentHadith() {
    return HADITH_LIST.find(function (h) { return h.id === hadithState.currentId; });
  }

  function buildHadithListItem(h) {
    var progress = getHadithProgress();
    var done = progress[h.id] && progress[h.id].answered;
    var item = document.createElement("button");
    item.className = "dua-list-item";
    var textWrap = document.createElement("span");
    var title = document.createElement("span");
    title.className = "dua-list-title";
    title.textContent = h.title;
    var srcLine = document.createElement("span");
    srcLine.className = "dua-list-cat";
    srcLine.textContent = h.source;
    textWrap.appendChild(title);
    textWrap.appendChild(srcLine);
    item.appendChild(textWrap);
    if (done) {
      var check = document.createElement("span");
      check.className = "dua-list-fav";
      check.textContent = "✓";
      item.appendChild(check);
    }
    item.addEventListener("click", function () {
      hadithState.currentId = h.id;
      renderHadithDetail();
      document.getElementById("hadith-list-view").classList.add("hidden");
      document.getElementById("hadith-detail-view").classList.remove("hidden");
    });
    return item;
  }

  function renderHadithList() {
    var list = document.getElementById("hadith-list");
    list.innerHTML = "";
    HADITH_LIST.forEach(function (h) {
      list.appendChild(buildHadithListItem(h));
    });
    document.getElementById("hadith-list-view").classList.remove("hidden");
    document.getElementById("hadith-detail-view").classList.add("hidden");
  }

  function renderHadithDetail() {
    var h = currentHadith();
    if (!h) return;
    document.getElementById("hadith-source").textContent = h.source;
    document.getElementById("hadith-arabic").textContent = h.arabic;
    document.getElementById("hadith-text").textContent = h.text;
    document.getElementById("hadith-explain").textContent = h.explain;

    var progress = getHadithProgress();
    var state = progress[h.id];
    var quizArea = document.getElementById("quiz-area");
    quizArea.innerHTML = "";

    var qTitle = document.createElement("p");
    qTitle.className = "hadith-text";
    qTitle.style.fontWeight = "600";
    qTitle.textContent = h.quiz.question;
    quizArea.appendChild(qTitle);

    h.quiz.options.forEach(function (opt, idx) {
      var btn = document.createElement("button");
      btn.className = "quiz-option";
      btn.textContent = opt;
      if (state && state.answered) {
        btn.disabled = true;
        if (idx === h.quiz.correctIndex) btn.classList.add("correct");
        else if (idx === state.pickedIndex) btn.classList.add("wrong");
      } else {
        btn.addEventListener("click", function () {
          answerQuiz(idx);
        });
      }
      quizArea.appendChild(btn);
    });

    var feedback = document.createElement("p");
    feedback.className = "quiz-feedback";
    if (state && state.answered) {
      feedback.textContent = h.quiz.feedback + (state.coinsAwarded ? (" +" + state.coinsAwarded + " coins.") : " (Coins only awarded once per lesson.)");
    }
    quizArea.appendChild(feedback);

    if (state && state.answered) {
      var currentIndex = HADITH_LIST.findIndex(function (item) { return item.id === h.id; });
      var nextHadith = HADITH_LIST[currentIndex + 1];
      var nextBtn = document.createElement("button");
      nextBtn.className = "btn btn-primary btn-full";
      if (nextHadith) {
        nextBtn.textContent = "Next lesson →";
        nextBtn.addEventListener("click", function () {
          hadithState.currentId = nextHadith.id;
          renderHadithDetail();
        });
      } else {
        nextBtn.textContent = "Back to lessons";
        nextBtn.addEventListener("click", function () {
          renderHadithList();
        });
      }
      nextBtn.style.marginTop = "12px";
      quizArea.appendChild(nextBtn);
    }
  }

  function answerQuiz(idx) {
    var h = currentHadith();
    if (!h) return;
    var progress = getHadithProgress();
    var already = progress[h.id] && progress[h.id].answered;
    var correct = idx === h.quiz.correctIndex;
    var coinsAwarded = 0;
    if (!already && correct) {
      coinsAwarded = 10;
      addCoins(coinsAwarded);
    }
    progress[h.id] = { answered: true, pickedIndex: idx, correct: correct, coinsAwarded: already ? 0 : coinsAwarded };
    saveHadithProgress(progress);
    renderHadithDetail();
    renderMore();
    if (!already && correct) showToast("Correct! +" + coinsAwarded + " coins");
    else if (!already) showToast("Not quite — see the highlighted answer");
  }

  function initHadithUI() {
    document.getElementById("hadith-back-btn").addEventListener("click", function () {
      renderHadithList();
    });
  }

  // ---------- AI CHAT (guided support, scripted) ----------

  var CHAT_OPTIONS = [
    {
      id: "wasted-day",
      label: "I wasted my day",
      respond: function () {
        return [
          "That happens — the day isn't over yet. What still matters today, even something small?",
          "Pick one small thing and start now. When the timer ends I'll ask if it's actually done — not just if the timer finished."
        ];
      },
      actionSuggestion: { label: "Start a 15-minute session", title: "Do the one thing that matters today (15 minutes)", minutes: 15 }
    },
    {
      id: "want-smoke",
      label: "I feel like smoking",
      respond: function () {
        return [
          "Try a short delay before deciding — a few minutes, on purpose.",
          "If you can, change location right now, even just to another room or outside.",
          "Do one alternative action instead — water, a short walk, a call to someone.",
          "Afterward, it can help to note what triggered it and whether the urge changed.",
          "If this keeps being hard to manage alone, real cessation support (a doctor, a quitline, a support group) can help far more than willpower alone — this isn't a full program, just a first step."
        ];
      }
    },
    {
      id: "urge-porn",
      label: "I'm getting an urge",
      respond: function () {
        return [
          "A few real options right now: put the phone down, leave the room or situation you're in, or open Shield for a short pause.",
          "You could also jump to today's actions and start a focus session on something else.",
          "No judgment here, and nothing here tracks or reports what you do — this is just a moment to choose your next step."
        ];
      },
      afterButtons: true
    },
    {
      id: "study-help",
      label: "Help me study",
      respond: function () {
        return [
          "Pick the one subject that matters most right now — not everything, just one.",
          "One 20-minute block beats trying to do everything at once."
        ];
      },
      actionSuggestion: { label: "Start a 20-minute study session", title: "Study for 20 minutes", minutes: 20 }
    },
    {
      id: "missed-routine",
      label: "I missed my routine",
      respond: function () {
        return [
          "Missing part of the routine doesn't erase what you did do — check Sunnah to see what's still open today.",
          "Pick one item you can still do now. A partial day is still a day you showed up for."
        ];
      }
    }
  ];

  function renderChatOptions() {
    var wrap = document.getElementById("chat-options");
    wrap.innerHTML = "";
    CHAT_OPTIONS.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.className = "chat-option-btn";
      btn.textContent = opt.label;
      btn.addEventListener("click", function () {
        showChatResponse(opt);
      });
      wrap.appendChild(btn);
    });
  }

  function showChatResponse(opt) {
    var card = document.getElementById("chat-response-card");
    var area = document.getElementById("chat-response");
    area.innerHTML = "";
    opt.respond().forEach(function (line) {
      var p = document.createElement("p");
      p.className = "chat-response-line";
      p.textContent = line;
      area.appendChild(p);
    });
    if (opt.afterButtons) {
      var shieldBtn = document.createElement("button");
      shieldBtn.className = "btn btn-primary btn-full";
      shieldBtn.textContent = "Open Shield now";
      shieldBtn.addEventListener("click", openShield);
      area.appendChild(shieldBtn);
    }
    if (opt.actionSuggestion) {
      var actionBtn = document.createElement("button");
      actionBtn.className = "chat-action-btn";
      actionBtn.textContent = opt.actionSuggestion.label;
      actionBtn.addEventListener("click", function () {
        quickStartFocusFromChat(opt.actionSuggestion.title, opt.actionSuggestion.minutes);
      });
      area.appendChild(actionBtn);
    }
    card.classList.remove("hidden");
  }

  function quickStartFocusFromChat(title, minutes) {
    startAdhocFocus(title, minutes);
    setActiveView("home");
  }

  // ---------- SHIELD ----------

  var shieldTimerId = null;

  function openShield() {
    document.getElementById("modal-shield").classList.remove("hidden");
    document.getElementById("shield-step-start").classList.remove("hidden");
    document.getElementById("shield-step-reason").classList.add("hidden");
    document.getElementById("shield-clock").textContent = "0:30";
  }

  function closeShield() {
    if (shieldTimerId) { clearInterval(shieldTimerId); shieldTimerId = null; }
    document.getElementById("modal-shield").classList.add("hidden");
  }

  function beginShieldPause() {
    var remaining = 30;
    document.getElementById("shield-begin-btn").disabled = true;
    shieldTimerId = setInterval(function () {
      remaining -= 1;
      document.getElementById("shield-clock").textContent = "0:" + String(Math.max(remaining, 0)).padStart(2, "0");
      if (remaining <= 0) {
        clearInterval(shieldTimerId);
        shieldTimerId = null;
        document.getElementById("shield-step-start").classList.add("hidden");
        document.getElementById("shield-step-reason").classList.remove("hidden");
      }
    }, 1000);
  }

  function logShieldUse(reason) {
    var log = readJSON("nc_shield_log", []);
    log.push({ date: todayKey(), reason: reason || "" });
    writeJSON("nc_shield_log", log);
  }

  function initShield() {
    document.getElementById("shield-close").addEventListener("click", closeShield);
    document.getElementById("shield-begin-btn").addEventListener("click", beginShieldPause);
    document.getElementById("shield-done-btn").addEventListener("click", function () {
      logShieldUse(document.getElementById("shield-reason-input").value.trim());
      document.getElementById("shield-reason-input").value = "";
      document.getElementById("shield-begin-btn").disabled = false;
      closeShield();
      showToast("Good. One small step counts.");
    });
    document.getElementById("shield-goal-btn").addEventListener("click", function () {
      logShieldUse(document.getElementById("shield-reason-input").value.trim());
      document.getElementById("shield-reason-input").value = "";
      document.getElementById("shield-begin-btn").disabled = false;
      closeShield();
      setActiveView("home");
    });
  }

  // ---------- MORE ----------

  var FEATURE_STATUS = [
    { name: "Home tasks + focus timer", status: "implemented" },
    { name: "Sunnah routine + Akhlaq tracking", status: "implemented" },
    { name: "Quran daily verse (Tanzil, Arabic only)", status: "implemented" },
    { name: "Hadith lesson + quiz (1 lesson)", status: "partial" },
    { name: "AI Chat (Bhai)", status: "planned", note: "scripted guided support only, not real AI" },
    { name: "Shield pause", status: "partial", note: "manual in-app only, no device-level blocking" },
    { name: "Vault / Hamdard", status: "planned", note: "no real encryption yet" },
    { name: "Duas library", status: "planned", note: "no reviewed source yet" },
    { name: "Full Quran + translation", status: "planned" },
    { name: "Prayer times / calculation method", status: "planned" },
    { name: "Notifications", status: "planned" },
    { name: "Ads / subscriptions / coin redemption", status: "planned", note: "business terms undecided" },
    { name: "Owner dashboard", status: "planned" }
  ];

  function renderFeatureStatus() {
    var list = document.getElementById("feature-status-list");
    list.innerHTML = "";
    FEATURE_STATUS.forEach(function (f) {
      var li = document.createElement("li");
      var label = document.createElement("span");
      label.textContent = f.name + (f.note ? " — " + f.note : "");
      var tag = document.createElement("span");
      tag.className = "status-tag " + f.status;
      tag.textContent = f.status;
      li.appendChild(label);
      li.appendChild(tag);
      list.appendChild(li);
    });
  }

  function renderMore() {
    var name = localStorage.getItem("nc_user_name");
    document.getElementById("more-name-display").textContent = name ? name : "No name set yet.";
    document.getElementById("coins-count").textContent = getCoins();
    renderFeatureStatus();
  }

  function initMore() {
    document.getElementById("edit-name-btn").addEventListener("click", function () {
      document.getElementById("modal-name").classList.remove("hidden");
    });

    document.getElementById("open-hamdard-btn").addEventListener("click", function () {
      setActiveView("vault");
    });

    document.getElementById("export-data-btn").addEventListener("click", function () {
      var data = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf("nc_") === 0) data[k] = readJSON(k, null);
      }
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "nura-data-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Export downloaded");
    });

    document.getElementById("clear-data-btn").addEventListener("click", function () {
      var confirmed = window.confirm("Delete all your NURA data on this device? This cannot be undone.");
      if (!confirmed) return;
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf("nc_") === 0) keys.push(k);
      }
      keys.forEach(function (k) { localStorage.removeItem(k); });
      showToast("All data deleted");
      location.reload();
    });
  }

  // ---------- NAV ----------

  function setActiveView(name) {
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.toggle("hidden", v.dataset.view !== name);
    });
    var navHighlight = name.indexOf("duniya") === 0 ? "duniya" : name;
    document.querySelectorAll(".nav-btn[data-nav]").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.nav === navHighlight);
    });
    if (name === "home") { mountPriorityCard("priority-card-home-slot"); renderHome(); }
    if (name === "duniya-tool") { mountPriorityCard("priority-card-duniya-slot"); renderTodaysPriority(); }
    if (name === "sunnah") { renderRoutine(); renderAkhlaq(); renderVerseOfDay(); renderHadithList(); renderDuaCategories(); }
    if (name === "chat") renderChatOptions();
    if (name === "vault") renderVaultRoot();
    if (name === "more") renderMore();
    if (name === "duniya") renderDuniya();
    if (name === "duniya-habits") renderDuniyaHabits();
    if (name === "duniya-productivity") renderDuniyaProductivity();
    if (name === "duniya-career") renderDuniyaCareer();
    if (name === "duniya-money") renderDuniyaMoney();
    if (name === "duniya-growth") renderDuniyaGrowth();
    if (name === "duniya-plan") renderDuniyaPlan();
    if (name === "duniya-phone-guard") renderPhoneGuard();
    if (name === "duniya-recovery") renderRecovery();
    if (name !== "duniya-recovery") rcStopTimer();
  }

  function initNav() {
    document.querySelectorAll(".nav-btn[data-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveView(btn.dataset.nav);
      });
    });
    document.getElementById("open-more-from-home").addEventListener("click", function () {
      setActiveView("more");
    });
  }

  // ---------- NAME MODAL ----------

  function initNameModal() {
    var existing = localStorage.getItem("nc_user_name");
    var modal = document.getElementById("modal-name");
    if (existing) {
      modal.classList.add("hidden");
    } else {
      modal.classList.remove("hidden");
    }
    var input = document.getElementById("name-input");
    var saveBtn = document.getElementById("name-save");

    function save() {
      var val = input.value.trim();
      if (val) {
        localStorage.setItem("nc_user_name", val);
      }
      modal.classList.add("hidden");
      renderHome();
      renderMore();
    }

    saveBtn.addEventListener("click", save);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") save();
    });
  }

  // ---------- DUNIYA (everyday self-improvement hub) ----------
  // Deen (Sunnah/Quran/Duas) stays separate from Duniya (study, phone,
  // sleep, fitness, habits, productivity, wellbeing, career, money,
  // growth) so users know which part of life they're working on, per
  // the two-worlds distinction in the brief. Study/Phone/Sleep/Fitness
  // reuse the exact same picker flow already built into Home rather
  // than duplicating that logic — Duniya just routes into it.

  var DUNIYA_AREAS = [
    { id: "study", icon: "📚", title: "Study & Focus", sub: "Pick a subject, start a timer.", route: "picker", step: "study-prep" },
    { id: "phone", icon: "📵", title: "Phone Control", sub: "Name the distraction, take a break from it.", route: "picker", step: "phone-distraction" },
    { id: "sleep", icon: "🌙", title: "Sleep", sub: "Set a bedtime, track when you wake.", route: "picker", step: "sleep-bedtime" },
    { id: "fitness", icon: "🏋️", title: "Fitness", sub: "Pick a body part and get moving.", route: "picker", step: "fitness-bodypart" },
    { id: "habits", icon: "✅", title: "Habits & Discipline", sub: "Build habits without streak pressure.", route: "view", view: "duniya-habits" },
    { id: "productivity", icon: "📋", title: "Productivity", sub: "Top 3 tasks, one at a time.", route: "view", view: "duniya-productivity" },
    { id: "wellbeing", icon: "🧘", title: "Mental Wellbeing", sub: "A grounding step when things feel heavy.", route: "view", view: "duniya-wellbeing" },
    { id: "career", icon: "🎯", title: "Career & Skills", sub: "One small goal, one daily action.", route: "view", view: "duniya-career" },
    { id: "money", icon: "💰", title: "Money Habits", sub: "A little daily awareness.", route: "view", view: "duniya-money" },
    { id: "growth", icon: "🌱", title: "Personal Growth", sub: "One practical exercise, not advice.", route: "view", view: "duniya-growth" }
  ];

  function mountPriorityCard(slotId) {
    var card = document.getElementById("priority-card-el");
    var slot = document.getElementById(slotId);
    if (!card || !slot) return;
    if (card.parentElement !== slot) {
      if (slotId === "priority-card-home-slot") {
        slot.parentNode.insertBefore(card, slot.nextSibling);
      } else {
        slot.appendChild(card);
      }
    }
  }

  function startDuniyaQuickAction(stepView) {
    var current = getCurrentPriority();
    if (current) {
      appendPriorityLog({ date: current.date, planKey: current.planKey, title: current.title, minutes: current.minutes, status: current.status === "pending" ? "not-yet" : current.status });
      savePriority(null);
      focusState.linkedPriorityId = null;
    }
    pickerStep = { view: stepView, bodyPart: null };
    setActiveView("duniya-tool");
  }

  function renderDuniyaToday() {
    var content = document.getElementById("duniya-today-content");
    var p = getCurrentPriority();
    content.innerHTML = "";
    if (!p) {
      var q = document.createElement("p");
      q.className = "muted-line";
      q.textContent = "What do you want to improve today?";
      content.appendChild(q);
      return;
    }
    var focusLabel = document.createElement("p");
    focusLabel.className = "salah-next-label";
    focusLabel.textContent = "Today's focus";
    content.appendChild(focusLabel);
    var title = document.createElement("p");
    title.className = "priority-title";
    title.style.margin = "0 0 8px";
    title.textContent = p.title;
    content.appendChild(title);
    var pct = computeProgressPercent(p);
    var progress = document.createElement("p");
    progress.className = "muted-line";
    progress.textContent = pct + "% today.";
    content.appendChild(progress);
    var contBtn = document.createElement("button");
    contBtn.className = "btn btn-primary btn-full";
    contBtn.textContent = "CONTINUE";
    contBtn.addEventListener("click", function () { setActiveView("home"); });
    content.appendChild(contBtn);
  }

  function renderDuniyaQuickActions() {
    var grid = document.getElementById("duniya-quick-actions");
    grid.innerHTML = "";
    var actions = [
      { label: "Focus Now", step: "study-prep" },
      { label: "Phone-Free Session", step: "phone-distraction" },
      { label: "Quick Workout", step: "fitness-bodypart" },
      { label: "Better Sleep", step: "sleep-bedtime" }
    ];
    actions.forEach(function (a) {
      var btn = document.createElement("button");
      btn.className = "preset-plan-chip";
      btn.textContent = a.label;
      btn.addEventListener("click", function () { startDuniyaQuickAction(a.step); });
      grid.appendChild(btn);
    });
    var planBtn = document.createElement("button");
    planBtn.className = "preset-plan-chip";
    planBtn.textContent = "Plan My Day";
    planBtn.addEventListener("click", function () { setActiveView("duniya-plan"); });
    grid.appendChild(planBtn);
    var resetBtn = document.createElement("button");
    resetBtn.className = "preset-plan-chip";
    resetBtn.textContent = "Reset My Day";
    resetBtn.addEventListener("click", function () {
      showToast("A missed morning doesn't cancel the rest of today — pick one small thing below.");
      setActiveView("duniya");
    });
    grid.appendChild(resetBtn);
  }

  function renderDuniyaAreaGrid() {
    var grid = document.getElementById("duniya-area-grid");
    grid.innerHTML = "";
    DUNIYA_AREAS.forEach(function (area) {
      var btn = document.createElement("button");
      btn.className = "duniya-area-card";
      btn.innerHTML =
        '<span class="duniya-area-icon">' + area.icon + '</span>' +
        '<span class="duniya-area-title">' + area.title + '</span>' +
        '<span class="duniya-area-sub">' + area.sub + '</span>';
      btn.addEventListener("click", function () {
        if (area.route === "picker") startDuniyaQuickAction(area.step);
        else setActiveView(area.view);
      });
      grid.appendChild(btn);
    });
  }

  function renderDuniya() {
    renderDuniyaToday();
    renderDuniyaQuickActions();
    renderDuniyaAreaGrid();
  }

  // ---- Habits & Discipline ----

  function getHabits() { return readJSON("nc_duniya_habits", []); }
  function saveHabits(h) { writeJSON("nc_duniya_habits", h); }
  function getHabitLogToday() {
    var all = readJSON("nc_duniya_habit_log", {});
    return all[todayKey()] || {};
  }
  function setHabitStatus(habitId, status) {
    var all = readJSON("nc_duniya_habit_log", {});
    var today = todayKey();
    all[today] = all[today] || {};
    all[today][habitId] = status;
    writeJSON("nc_duniya_habit_log", all);
  }

  function renderDuniyaHabits() {
    var list = document.getElementById("duniya-habit-list");
    list.innerHTML = "";
    var habits = getHabits();
    var log = getHabitLogToday();
    if (!habits.length) {
      var empty = document.createElement("p");
      empty.className = "muted-line";
      empty.textContent = "No habits yet — add one below.";
      list.appendChild(empty);
    }
    habits.forEach(function (h) {
      var item = document.createElement("div");
      item.className = "habit-item";
      var name = document.createElement("span");
      name.className = "name";
      name.textContent = h.name;
      item.appendChild(name);
      var status = log[h.id];
      var actions = document.createElement("div");
      actions.className = "action-buttons";
      ["done", "missed", "restarted"].forEach(function (s) {
        var btn = document.createElement("button");
        btn.className = "action-btn" + (status === s ? " primary" : "");
        btn.textContent = s.charAt(0).toUpperCase() + s.slice(1);
        btn.addEventListener("click", function () { setHabitStatus(h.id, s); renderDuniyaHabits(); });
        actions.appendChild(btn);
      });
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  function initDuniyaHabits() {
    document.getElementById("duniya-habits-back").addEventListener("click", function () { setActiveView("duniya"); });
    document.getElementById("duniya-habit-add-btn").addEventListener("click", function () {
      var input = document.getElementById("duniya-habit-input");
      var val = input.value.trim();
      if (!val) return;
      var habits = getHabits();
      habits.push({ id: uid("hab"), name: val });
      saveHabits(habits);
      input.value = "";
      renderDuniyaHabits();
    });
  }

  // ---- Productivity ----

  function getTop3() { return readJSON("nc_duniya_top3_" + todayKey(), ["", "", ""]); }
  function saveTop3(arr) { writeJSON("nc_duniya_top3_" + todayKey(), arr); }
  function getTop3Done() { return readJSON("nc_duniya_top3_done_" + todayKey(), [false, false, false]); }
  function saveTop3Done(arr) { writeJSON("nc_duniya_top3_done_" + todayKey(), arr); }

  function renderDuniyaProductivity() {
    var list = document.getElementById("duniya-top3-list");
    list.innerHTML = "";
    var tasks = getTop3();
    var done = getTop3Done();
    for (var i = 0; i < 3; i++) {
      (function (idx) {
        var row = document.createElement("div");
        row.className = "duniya-goal-item";
        var input = document.createElement("input");
        input.type = "text";
        input.className = "text-input";
        input.style.marginBottom = "0";
        input.placeholder = "Task " + (idx + 1);
        input.value = tasks[idx] || "";
        input.addEventListener("change", function () {
          var t = getTop3();
          t[idx] = input.value.trim();
          saveTop3(t);
        });
        var check = document.createElement("button");
        check.className = "action-btn" + (done[idx] ? " primary" : "");
        check.textContent = done[idx] ? "Done" : "Mark done";
        check.style.marginLeft = "8px";
        check.addEventListener("click", function () {
          var d = getTop3Done();
          d[idx] = !d[idx];
          saveTop3Done(d);
          renderDuniyaProductivity();
        });
        row.appendChild(input);
        row.appendChild(check);
        list.appendChild(row);
      })(i);
    }
    var startBtn = document.createElement("button");
    startBtn.className = "btn btn-outline btn-full";
    startBtn.textContent = "Start One Task";
    startBtn.addEventListener("click", function () {
      var t = getTop3();
      var firstUnfinished = t.findIndex(function (v, idx) { return v && !done[idx]; });
      if (firstUnfinished === -1) { showToast("Add or finish a task first"); return; }
      startAdhocFocus(t[firstUnfinished], 25);
      setActiveView("home");
    });
    list.appendChild(startBtn);
  }

  function initDuniyaProductivity() {
    document.getElementById("duniya-productivity-back").addEventListener("click", function () { setActiveView("duniya"); });
    document.getElementById("duniya-eod-save-btn").addEventListener("click", function () {
      var val = document.getElementById("duniya-eod-note").value.trim();
      writeJSON("nc_duniya_eod_" + todayKey(), val);
      showToast("Saved");
    });
  }

  // ---- Mental Wellbeing ----

  var DUNIYA_WELLBEING_OPTIONS = [
    { id: "stressed", label: "I feel stressed", lines: ["Take three slow breaths right now — in for 4, out for 6.", "Name one thing causing it. You don't have to fix it this second, just name it.", "Pick one small next step, even a 5-minute one."] },
    { id: "overwhelmed", label: "I feel overwhelmed", lines: ["Everything feeling like too much at once is a sign to shrink the list, not push harder.", "Pick just one thing from everything on your mind and do only that.", "The rest can wait until this one is done."] },
    { id: "wasted-day", label: "I wasted my day", lines: ["The day isn't over yet. What still matters today, even something small?", "One small action now counts more than regret about the rest of the day."] },
    { id: "cannot-focus", label: "I cannot focus", lines: ["Try a very short session first — 5 minutes, not 25.", "Remove one distraction (phone in another room) before trying again."] },
    { id: "angry", label: "I am angry", lines: ["Step away from the situation for a moment before responding.", "Slow, deliberate breaths for 30 seconds can lower the intensity.", "Write down what happened before deciding what to do about it."] }
  ];

  function renderDuniyaWellbeingOptions() {
    var wrap = document.getElementById("duniya-wellbeing-options");
    wrap.innerHTML = "";
    DUNIYA_WELLBEING_OPTIONS.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.className = "chat-option-btn";
      btn.textContent = opt.label;
      btn.addEventListener("click", function () {
        var card = document.getElementById("duniya-wellbeing-response-card");
        var area = document.getElementById("duniya-wellbeing-response");
        area.innerHTML = "";
        opt.lines.forEach(function (line) {
          var p = document.createElement("p");
          p.className = "chat-response-line";
          p.textContent = line;
          area.appendChild(p);
        });
        var chatBtn = document.createElement("button");
        chatBtn.className = "btn btn-outline btn-full";
        chatBtn.textContent = "Talk to Bhai (AI Chat)";
        chatBtn.addEventListener("click", function () { setActiveView("chat"); });
        area.appendChild(chatBtn);
        card.classList.remove("hidden");
      });
      wrap.appendChild(btn);
    });
  }

  function initDuniyaWellbeing() {
    document.getElementById("duniya-wellbeing-back").addEventListener("click", function () { setActiveView("duniya"); });
    renderDuniyaWellbeingOptions();
  }

  // ---- Career & Skills ----

  var DUNIYA_SKILL_AREAS = ["Communication", "English", "Coding", "Business", "Study", "Job preparation"];

  function getSkillGoal() { return readJSON("nc_duniya_skill_goal", null); }
  function saveSkillGoal(g) { writeJSON("nc_duniya_skill_goal", g); }

  // ---- Career Skills lesson library ----
  // LEARN -> PRACTICE -> DO -> REFLECT, not READ -> READ -> READ.
  // "How to Talk to People" gets the full rich treatment as the flagship
  // lesson; every other lesson uses the same reusable template (why /
  // explanation / steps / practice / challenge / reflection) so nothing
  // is a dead "OK"-only screen, without padding every lesson to the same
  // length. More lessons can be added to any category later.

  var CAREER_SKILLS = [
    { key: "communication", label: "Communication", lessons: [
      {
        key: "talk-to-people", title: "How to Talk to People",
        why: "Good communication is not about talking more. It's about starting clearly, listening, asking good questions, and making the other person comfortable.",
        explanation: "Most people overthink starting a conversation. A short, simple opener is almost always enough — the real skill is in what you do after that.",
        steps: [
          "Start simple: “Hi, how are you?” / “How do you know everyone here?” / “What are you working on?” / “How was your day?” — avoid complicated or personal openers.",
          "Use Ask → Listen → Follow-up: build your next question from their answer. (“What are you studying?” → “Computer science.” → “Oh nice, what made you choose that?”)",
          "Don't turn it into an interview. BAD: “Where are you from? What do you study? How old are you? What do you do?” one after another. GOOD: one question, really listen, then one natural follow-up from their actual answer.",
          "Body language: look at the person naturally, keep shoulders relaxed, don't check your phone, don't interrupt, speak clearly, smile when it fits.",
          "Stuck for what to ask? Use F.O.R.D. — Family, Occupation/Studies, Recreation/Interests, Dreams/Goals — but let it feel like curiosity, not a checklist."
        ],
        practice: "Next time someone answers a question, resist the urge to ask your next prepared question — ask something that reacts to what they just said instead.",
        challenge: "Start one 2-minute conversation with someone — a classmate, coworker, shopkeeper, friend, relative, or gym member."
      },
      { key: "active-listening", title: "Active Listening",
        why: "People can tell within seconds whether you're actually listening or just waiting to talk.",
        explanation: "Active listening means your next sentence is built from what the other person just said, not from what you'd already planned to say.",
        steps: ["Don't plan your reply while they're still talking.", "Repeat back the key point in your own words before responding.", "Ask one genuine follow-up question about what they said.", "Notice tone and body language, not just words."],
        practice: "In your next conversation, before replying, silently repeat their last sentence in your head first.",
        challenge: "In one conversation today, respond to at least two things by repeating them back in your own words first." },
      { key: "speaking-clearly", title: "Speaking Clearly",
        why: "Being understood the first time saves everyone's time and makes you sound more confident.",
        explanation: "Clear speech is usually about slowing down and cutting filler, not about a bigger vocabulary.",
        steps: ["Slow down — most people speak faster than they think when nervous.", "Cut filler words like ‘um’ and ‘like’ by pausing instead.", "Say one idea per sentence.", "End sentences clearly instead of trailing off."],
        practice: "Record 30 seconds of yourself explaining something simple, then listen back once.",
        challenge: "In your next conversation, deliberately pause instead of saying ‘um’ at least three times." },
      { key: "better-questions", title: "Asking Better Questions",
        why: "The quality of a conversation usually comes down to the quality of the questions, not the answers.",
        explanation: "Closed questions (yes/no) end conversations. Open questions keep them going.",
        steps: ["Prefer ‘What’ and ‘How’ questions over yes/no ones.", "Ask about specifics, not generalities (‘What part of it?’ not just ‘How was it?’).", "Follow up on the most interesting part of their answer, not the first thing you thought of.", "Leave space — don't fill every pause yourself."],
        practice: "Turn one yes/no question you'd normally ask into an open one before asking it.",
        challenge: "In one conversation today, ask at least two open-ended follow-up questions." },
      { key: "public-speaking", title: "Public Speaking Basics",
        why: "Most fear around public speaking comes from not having a simple structure to rely on.",
        explanation: "You don't need to memorize a script — you need 3 clear points and a calm pace.",
        steps: ["Open with why this matters to the audience, not a long introduction.", "Stick to 3 main points, no more.", "Pause after key points instead of rushing on.", "Look at a few friendly faces in the room, not the floor or ceiling.", "Close by repeating your main point in one sentence."],
        practice: "Explain one topic out loud for 60 seconds using exactly 3 points, timed.",
        challenge: "Speak up with one clear point in a group setting today — a class, meeting, or group chat voice note." },
      { key: "difficult-conversations", title: "Difficult Conversations",
        why: "Avoiding a hard conversation usually makes the problem bigger, not smaller.",
        explanation: "Difficult conversations go better when you separate the person from the problem and stay specific.",
        steps: ["State the specific issue, not a general complaint (‘This deadline was missed’ not ‘You're always late’).", "Say how it affected you or the situation, briefly.", "Ask their side before concluding anything.", "Agree on one concrete next step before ending."],
        practice: "Write down the one specific sentence you'd open a hard conversation with — before you actually have it.",
        challenge: "If something is bothering you, say the first honest sentence of that conversation to the person today — even if the rest waits." }
    ]},
    { key: "professional", label: "Professional Skills", lessons: [
      { key: "time-management", title: "Time Management",
        why: "Most time problems are planning problems, not effort problems.",
        explanation: "Deciding what NOT to do today matters more than trying to fit everything in.",
        steps: ["Pick your top 1-3 priorities before the day starts, not during it.", "Do the hardest task first, while your energy is highest.", "Block time for a task instead of leaving it 'somewhere today'.", "Say no to, or postpone, anything that isn't a priority."],
        practice: "Before you start work today, write your top priority on paper first.",
        challenge: "Do your single hardest task today before you check your phone." },
      { key: "problem-solving", title: "Problem Solving",
        why: "Most 'stuck' moments are really just an undefined problem, not an unsolvable one.",
        explanation: "Clearly naming the actual problem usually reveals the next step.",
        steps: ["Write the problem down in one specific sentence.", "List what's actually in your control right now.", "Pick the smallest next action, not the whole solution.", "Do that one action before reconsidering the whole problem."],
        practice: "Take something vaguely bothering you and write it as one specific sentence.",
        challenge: "Pick one real problem you're avoiding and do the smallest next step on it today." },
      { key: "teamwork", title: "Teamwork",
        why: "Most team friction comes from unclear expectations, not personality clashes.",
        explanation: "Good teammates make their own work visible and ask before assuming.",
        steps: ["State clearly what you're working on and by when.", "Ask instead of assuming when something's unclear.", "Give credit specifically, not generically.", "Flag a blocker early, not after it's already a problem."],
        practice: "Tell one teammate exactly what you're doing today, unprompted.",
        challenge: "Proactively update someone on your progress today, before they have to ask." },
      { key: "leadership-basics", title: "Leadership Basics",
        why: "Leadership isn't a title — it's taking responsibility before you're asked to.",
        explanation: "The simplest form of leadership is doing the unglamorous thing that needs doing.",
        steps: ["Notice what needs doing that no one's claimed.", "Take ownership of one small thing without being asked.", "Give one specific, useful piece of feedback.", "Follow through on what you said you'd do."],
        practice: "Notice one small task today that's nobody's job and just do it.",
        challenge: "Take ownership of one thing today that wasn't officially assigned to you." },
      { key: "decision-making", title: "Decision Making",
        why: "Indecision often costs more than picking an imperfect option.",
        explanation: "Most everyday decisions don't need to be perfect — they need to be made.",
        steps: ["Set a time limit for the decision.", "List only the 2-3 options that actually matter.", "Ask: what's the real cost of being wrong here?", "Decide, then stop reopening it."],
        practice: "Pick one small decision you've been putting off and set yourself 5 minutes to decide.",
        challenge: "Make one pending decision today instead of leaving it open." }
    ]},
    { key: "job", label: "Job Skills", lessons: [
      { key: "resume-basics", title: "Resume Basics",
        why: "A resume's job is to get you an interview, not to list everything you've ever done.",
        explanation: "Specific, measurable lines beat vague descriptions every time.",
        steps: ["Lead each line with what you did, using an action verb.", "Add a number or result where possible.", "Cut anything irrelevant to the role you want.", "Keep it to one page if you're early in your career."],
        practice: "Rewrite one line of your resume to include a specific number or result.",
        challenge: "Rewrite three bullet points on your resume to be more specific today." },
      { key: "interview-basics", title: "Interview Basics",
        why: "Most interviews are lost to vague answers, not to a lack of qualification.",
        explanation: "Specific stories beat general claims — interviewers remember examples, not adjectives.",
        steps: ["Prepare 2-3 real stories using: Situation, Task, Action, Result.", "Answer the actual question asked, not a rehearsed speech.", "Prepare 2 genuine questions to ask them.", "Practice saying your stories out loud, not just in your head."],
        practice: "Turn one line from your resume into a 30-second Situation-Task-Action-Result story.",
        challenge: "Say one of your interview stories out loud, from start to finish, today." },
      { key: "networking", title: "Networking",
        why: "Networking is just staying in genuine touch with people — not asking strangers for favors.",
        explanation: "The best networking looks like helping first and reconnecting naturally.",
        steps: ["Reach out with a specific, genuine reason, not just 'let's connect'.", "Offer something before asking for something, if you can.", "Follow up after a helpful conversation with a short thank-you.", "Keep in touch occasionally, not only when you need something."],
        practice: "Think of one person you haven't spoken to in a while and draft a short message to them.",
        challenge: "Send that message to one real contact today." },
      { key: "professional-email", title: "Professional Email",
        why: "A clear email gets a faster, better response than a long one.",
        explanation: "State the ask in the first two lines — don't bury it in a big story.",
        steps: ["Use a specific subject line, not 'Hi' or 'Question'.", "State your ask or point in the first two sentences.", "Keep paragraphs short.", "End with a clear, specific next step."],
        practice: "Rewrite the subject line of your next email to be specific.",
        challenge: "Send one email today that states your ask in the first two sentences." },
      { key: "workplace-communication", title: "Workplace Communication",
        why: "Most workplace confusion comes from assuming instead of confirming.",
        explanation: "Confirming understanding out loud prevents most misunderstandings before they start.",
        steps: ["Repeat back instructions in your own words to confirm.", "Communicate delays as soon as you know, not at the deadline.", "Put important decisions in writing, briefly.", "Match your tone to the channel — chat isn't email isn't a meeting."],
        practice: "Next time you get an instruction, repeat it back in your own words before starting.",
        challenge: "Confirm one instruction or task today by repeating it back before you begin." }
    ]},
    { key: "learning", label: "Learning Skills", lessons: [
      { key: "learn-faster", title: "Learn Faster",
        why: "How you study matters more than how long you study.",
        explanation: "Actively recalling information beats re-reading it almost every time.",
        steps: ["After reading a section, close it and try to explain it from memory.", "Space repetition out over days instead of cramming once.", "Teach the idea to someone else, even out loud to yourself.", "Test yourself before you feel ready."],
        practice: "Pick something you studied recently and try to explain it out loud without looking.",
        challenge: "Study one topic today using recall (close the book, explain it) instead of just re-reading." },
      { key: "better-notes", title: "Take Better Notes",
        why: "Notes you never review are just typing practice.",
        explanation: "Good notes are built to be reviewed later, not just written once.",
        steps: ["Write in your own words, not verbatim.", "Summarize each section in one line at the top.", "Leave space to add questions or connections later.", "Review notes within 24 hours, briefly."],
        practice: "Take your last set of notes and add a one-line summary to the top.",
        challenge: "Review one page of old notes today and add anything you now understand better." },
      { key: "deep-work", title: "Deep Work",
        why: "A distracted hour produces far less than 25 minutes of real focus.",
        explanation: "Deep work needs a clear task, a time limit, and removed distractions — all three, not just one.",
        steps: ["Pick one specific task, not 'work on project'.", "Set a timer for a fixed block.", "Remove your phone from the room, not just silence it.", "Take a real break when the timer ends."],
        practice: "Pick your next task and write the one specific outcome you want from this session.",
        challenge: "Do one real 25-minute deep work block today, phone out of the room." },
      { key: "remember", title: "Remember What You Learn",
        why: "Most forgetting happens because information is never revisited, not because it was too hard.",
        explanation: "A few short reviews over time beat one long review.",
        steps: ["Review new information within a day of learning it.", "Review again after a few days, then a week.", "Connect new information to something you already know.", "Write a one-line summary in your own words."],
        practice: "Pick one thing you learned this week and write a one-line summary from memory.",
        challenge: "Review one thing you learned earlier this week today, without looking it up first." }
    ]}
  ];

  function findCareerLesson(catKey, lessonKey) {
    var cat = CAREER_SKILLS.find(function (c) { return c.key === catKey; });
    if (!cat) return null;
    var lesson = cat.lessons.find(function (l) { return l.key === lessonKey; });
    return lesson ? { cat: cat, lesson: lesson } : null;
  }

  function getCareerProgress() { return readJSON("nc_duniya_career_progress", {}); }
  function saveCareerProgress(p) { writeJSON("nc_duniya_career_progress", p); }

  function renderDuniyaCareer() {
    var content = document.getElementById("duniya-career-content");
    content.innerHTML = "";

    var h2 = document.createElement("h2");
    h2.textContent = "Career Skills";
    content.appendChild(h2);
    var sub = document.createElement("p");
    sub.className = "muted-line";
    sub.style.marginBottom = "14px";
    sub.textContent = "Short, practical lessons — learn, practice, do.";
    content.appendChild(sub);

    var progress = getCareerProgress();
    CAREER_SKILLS.forEach(function (cat) {
      var catTitle = document.createElement("p");
      catTitle.className = "picker-step-title";
      catTitle.textContent = cat.label;
      content.appendChild(catTitle);
      var list = document.createElement("div");
      list.className = "dua-list";
      list.style.marginBottom = "16px";
      cat.lessons.forEach(function (lesson) {
        var row = document.createElement("button");
        row.className = "dua-list-item";
        var done = progress[cat.key + ":" + lesson.key];
        row.innerHTML = '<span class="dua-list-title">' + lesson.title + '</span>' + (done ? '<span class="dua-list-fav">✓</span>' : '');
        row.addEventListener("click", function () { openCareerLesson(cat.key, lesson.key); });
        list.appendChild(row);
      });
      content.appendChild(list);
    });

    var divider = document.createElement("div");
    divider.className = "sunnah-item-divider";
    content.appendChild(divider);

    var goalTitle = document.createElement("p");
    goalTitle.className = "picker-step-title";
    goalTitle.textContent = "My Skill Goal";
    content.appendChild(goalTitle);
    renderSkillGoalArea(content);
  }

  function renderSkillGoalArea(content) {
    var goal = getSkillGoal();
    if (!goal) {
      var label = document.createElement("p");
      label.className = "muted-line";
      label.textContent = "Track daily action on one skill area of your own.";
      content.appendChild(label);
      var grid = document.createElement("div");
      grid.className = "preset-plan-grid";
      DUNIYA_SKILL_AREAS.forEach(function (area) {
        var btn = document.createElement("button");
        btn.className = "preset-plan-chip";
        btn.textContent = area;
        btn.addEventListener("click", function () { renderSkillGoalForm(area); });
        grid.appendChild(btn);
      });
      content.appendChild(grid);
      return;
    }
    var goalLine = document.createElement("p");
    goalLine.className = "muted-line";
    goalLine.textContent = goal.area + ": " + goal.goal;
    content.appendChild(goalLine);
    var todayDone = (goal.log || {})[todayKey()];
    var actionBtn = document.createElement("button");
    actionBtn.className = "btn btn-primary btn-full";
    actionBtn.textContent = todayDone ? "Today's action done ✓" : "Mark today's action done";
    actionBtn.disabled = !!todayDone;
    actionBtn.addEventListener("click", function () {
      goal.log = goal.log || {};
      goal.log[todayKey()] = true;
      saveSkillGoal(goal);
      renderDuniyaCareer();
    });
    content.appendChild(actionBtn);
    var changeBtn = document.createElement("button");
    changeBtn.className = "priority-change-link";
    changeBtn.textContent = "Choose a different goal";
    changeBtn.addEventListener("click", function () { saveSkillGoal(null); renderDuniyaCareer(); });
    content.appendChild(changeBtn);
  }

  function renderSkillGoalForm(area) {
    var content = document.getElementById("duniya-career-content");
    content.innerHTML = "";
    var h2 = document.createElement("h2");
    h2.textContent = area;
    content.appendChild(h2);
    var label = document.createElement("p");
    label.className = "muted-line";
    label.textContent = "What's one small goal here?";
    content.appendChild(label);
    var input = document.createElement("input");
    input.type = "text";
    input.className = "text-input";
    input.placeholder = "e.g. Practice speaking 10 minutes daily";
    content.appendChild(input);
    var saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-primary btn-full";
    saveBtn.textContent = "Set goal";
    saveBtn.addEventListener("click", function () {
      var val = input.value.trim();
      if (!val) return;
      saveSkillGoal({ area: area, goal: val, log: {} });
      renderDuniyaCareer();
    });
    content.appendChild(saveBtn);
    var backBtn = document.createElement("button");
    backBtn.className = "priority-change-link";
    backBtn.textContent = "← Back";
    backBtn.addEventListener("click", renderDuniyaCareer);
    content.appendChild(backBtn);
  }

  function openCareerLesson(catKey, lessonKey) {
    var found = findCareerLesson(catKey, lessonKey);
    if (!found) return;
    var lesson = found.lesson, cat = found.cat;
    var content = document.getElementById("duniya-career-content");
    content.innerHTML = "";

    var backBtn = document.createElement("button");
    backBtn.className = "picker-step-back";
    backBtn.textContent = "← Career Skills";
    backBtn.addEventListener("click", renderDuniyaCareer);
    content.appendChild(backBtn);

    var title = document.createElement("h2");
    title.textContent = lesson.title;
    content.appendChild(title);

    var why = document.createElement("p");
    why.className = "priority-why";
    why.textContent = lesson.why;
    content.appendChild(why);

    var expl = document.createElement("p");
    expl.className = "hadith-text";
    expl.textContent = lesson.explanation;
    content.appendChild(expl);

    var stepsTitle = document.createElement("p");
    stepsTitle.className = "picker-step-title";
    stepsTitle.textContent = "Practical steps";
    content.appendChild(stepsTitle);
    var stepsList = document.createElement("ul");
    stepsList.className = "fitness-warmup-list";
    lesson.steps.forEach(function (s) {
      var li = document.createElement("li");
      li.textContent = s;
      stepsList.appendChild(li);
    });
    content.appendChild(stepsList);

    var practiceTitle = document.createElement("p");
    practiceTitle.className = "picker-step-title";
    practiceTitle.textContent = "Mini practice";
    content.appendChild(practiceTitle);
    var practiceP = document.createElement("p");
    practiceP.className = "hadith-explain";
    practiceP.textContent = lesson.practice;
    content.appendChild(practiceP);

    var progress = getCareerProgress();
    var key = catKey + ":" + lessonKey;
    var entry = progress[key];

    var challengeTitle = document.createElement("p");
    challengeTitle.className = "picker-step-title";
    challengeTitle.textContent = "TODAY'S CHALLENGE";
    content.appendChild(challengeTitle);
    var challengeP = document.createElement("p");
    challengeP.className = "hadith-text";
    challengeP.textContent = lesson.challenge;
    content.appendChild(challengeP);

    if (!entry || !entry.started) {
      var startBtn = document.createElement("button");
      startBtn.className = "btn btn-primary btn-full";
      startBtn.textContent = "Start Challenge";
      startBtn.addEventListener("click", function () {
        progress[key] = { started: true, done: false };
        saveCareerProgress(progress);
        openCareerLesson(catKey, lessonKey);
      });
      content.appendChild(startBtn);
    } else if (!entry.done) {
      var doneBtn = document.createElement("button");
      doneBtn.className = "btn btn-primary btn-full";
      doneBtn.textContent = "I Did It";
      doneBtn.addEventListener("click", function () {
        entry.done = true;
        entry.completedDate = todayKey();
        saveCareerProgress(progress);
        openCareerLesson(catKey, lessonKey);
      });
      content.appendChild(doneBtn);
    } else if (!entry.difficulty) {
      var howLabel = document.createElement("p");
      howLabel.className = "muted-line";
      howLabel.textContent = "How did it go?";
      content.appendChild(howLabel);
      var moodRow = document.createElement("div");
      moodRow.className = "priority-checkin-buttons";
      [["Easy", "🙂"], ["Okay", "😐"], ["Difficult", "😬"]].forEach(function (m) {
        var btn = document.createElement("button");
        btn.className = "action-btn";
        btn.textContent = m[1] + " " + m[0];
        btn.addEventListener("click", function () {
          entry.difficulty = m[0];
          saveCareerProgress(progress);
          openCareerLesson(catKey, lessonKey);
        });
        moodRow.appendChild(btn);
      });
      content.appendChild(moodRow);
    } else {
      var doneText = document.createElement("p");
      doneText.className = "priority-done-text";
      doneText.textContent = "Completed ✓ (" + entry.difficulty + ")";
      content.appendChild(doneText);
      if (!entry.reflection) {
        var reflLabel = document.createElement("p");
        reflLabel.className = "muted-line";
        reflLabel.textContent = "What was difficult? (optional)";
        content.appendChild(reflLabel);
        var reflInput = document.createElement("input");
        reflInput.type = "text";
        reflInput.className = "text-input";
        content.appendChild(reflInput);
        var saveReflBtn = document.createElement("button");
        saveReflBtn.className = "btn btn-outline btn-full";
        saveReflBtn.textContent = "Save reflection";
        saveReflBtn.addEventListener("click", function () {
          entry.reflection = reflInput.value.trim();
          saveCareerProgress(progress);
          openCareerLesson(catKey, lessonKey);
        });
        content.appendChild(saveReflBtn);
      } else {
        var reflShown = document.createElement("p");
        reflShown.className = "muted-line";
        reflShown.textContent = "Reflection: " + entry.reflection;
        content.appendChild(reflShown);
      }
      var restartBtn = document.createElement("button");
      restartBtn.className = "priority-change-link";
      restartBtn.textContent = "Do this challenge again";
      restartBtn.addEventListener("click", function () {
        progress[key] = { started: true, done: false };
        saveCareerProgress(progress);
        openCareerLesson(catKey, lessonKey);
      });
      content.appendChild(restartBtn);
    }
  }

  function initDuniyaCareer() {
    document.getElementById("duniya-career-back").addEventListener("click", function () { setActiveView("duniya"); });
  }

  // ---- Money Habits ----
  // Four different things are tracked separately and never mixed:
  //   A. money AVOIDED (something you didn't buy / a habit you reduced)
  //   B. money ACTUALLY SAVED (added to a goal, or kept as unallocated savings)
  //   C. money ADDED TO SAVINGS GOALS (the contributions ledger)
  //   D. money SPENT (logged expenses + avoided money the user says went elsewhere)
  // A goal only grows when the user confirms money went into it.

  var MONEY_HABIT_CATEGORIES = [
    "Smoking", "Tobacco", "Alcohol", "Recreational drugs", "Junk food",
    "Soft drinks", "Tea/Coffee", "Food delivery", "Gaming purchases",
    "Shopping", "Subscriptions", "Online impulse purchases",
    "Transport waste", "Betting/gambling expenses tracking only", "Other / Custom"
  ];
  var MONEY_GOAL_PRESETS = [
    "Emergency fund", "Phone", "Laptop", "Course", "Gym membership", "Travel", "Family", "Business"
  ];
  var MONEY_SOURCES = [
    { key: "income", label: "Salary / income" },
    { key: "avoided-purchase", label: "Avoided purchase" },
    { key: "smoking", label: "Smoking reduction" },
    { key: "habit", label: "Other bad habit reduction" },
    { key: "gift", label: "Gift" },
    { key: "cash", label: "Cash saved" },
    { key: "other", label: "Other" }
  ];
  function moneySourceLabel(key) {
    if (key === "unallocated") return "Moved from unallocated savings";
    if (key === "legacy") return "Earlier savings";
    if (key === "manual") return "Added manually";
    var s = MONEY_SOURCES.filter(function (x) { return x.key === key; })[0];
    return s ? s.label : "Added manually";
  }

  var moneyView = { screen: "dashboard" };

  function goMoneyScreen(screen, extra) {
    var e = extra || {};
    e.screen = screen;
    moneyView = e;
    renderDuniyaMoney();
  }

  function fmtRupee(n) {
    n = Math.round(n || 0);
    return "₹" + n.toLocaleString("en-IN");
  }

  function mEl(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function mBtn(label, cls, fn) {
    var b = mEl("button", cls, label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }
  function mRows(rows) {
    var box = mEl("div", "money-cost-breakdown");
    rows.forEach(function (r) {
      var row = mEl("div", "row" + (r[2] ? " highlight" : ""));
      row.appendChild(mEl("span", "", r[0]));
      row.appendChild(mEl("span", "", r[1]));
      box.appendChild(row);
    });
    return box;
  }
  function mNumInput(placeholder, value, onInput) {
    var i = mEl("input", "text-input");
    i.type = "number";
    i.min = "0";
    i.placeholder = placeholder;
    i.value = value || "";
    i.addEventListener("input", function () { onInput(i.value); });
    return i;
  }

  // -- data accessors (all local, all persisted) --
  function getMoneyGoals() { return readJSON("nc_money_goals", []); }
  function saveMoneyGoals(arr) { writeJSON("nc_money_goals", arr); }
  function getContribs() { return readJSON("nc_money_contribs", []); }
  function saveContribs(a) { writeJSON("nc_money_contribs", a); }
  function getUnalloc() { return readJSON("nc_money_unalloc", []); }
  function saveUnalloc(a) { writeJSON("nc_money_unalloc", a); }
  function getExpenses() { return readJSON("nc_money_expenses", []); }
  function saveExpenses(a) { writeJSON("nc_money_expenses", a); }
  function getMoneyHabits() { return readJSON("nc_money_habits", []); }
  function saveMoneyHabits(arr) { writeJSON("nc_money_habits", arr); }
  function getMoneyDailyLogs() { return readJSON("nc_money_daily_logs", {}); }
  function saveMoneyDailyLogs(obj) { writeJSON("nc_money_daily_logs", obj); }
  function getDailyLogEntry(habitId, dateKey) {
    var logs = getMoneyDailyLogs();
    return (logs[dateKey] && logs[dateKey][habitId]) || null;
  }
  function saveDailyLogEntry(habitId, dateKey, entry) {
    var logs = getMoneyDailyLogs();
    if (!logs[dateKey]) logs[dateKey] = {};
    logs[dateKey][habitId] = entry;
    saveMoneyDailyLogs(logs);
  }
  function getAvoidedPurchases() { return readJSON("nc_money_avoided_purchases", []); }
  function saveAvoidedPurchases(arr) { writeJSON("nc_money_avoided_purchases", arr); }
  function getPurchaseDecisions() { return readJSON("nc_money_purchase_decisions", []); }
  function savePurchaseDecisions(arr) { writeJSON("nc_money_purchase_decisions", arr); }

  function moneyHabitCosts(habit) {
    var daily = habit.normalDailyQuantity * habit.costPerUnit;
    return { daily: daily, weekly: daily * 7, monthly: daily * 30, yearly: daily * 365 };
  }

  // Older builds stored a running total on each goal and a "general savings"
  // destination. Convert once so nothing the user already logged is lost.
  function moneyMigrateV2() {
    if (localStorage.getItem("nc_money_v2")) return;
    var contribs = getContribs(), unalloc = getUnalloc();
    getMoneyGoals().forEach(function (g) {
      var has = contribs.some(function (c) { return c.goalId === g.id; });
      if (!has && g.currentSavedAmount > 0) {
        contribs.push({ id: uid("contrib"), goalId: g.id, amount: g.currentSavedAmount, source: "legacy", sourceLabel: "Earlier savings", note: "Earlier savings", date: (g.createdAt || new Date().toISOString()).slice(0, 10), at: g.createdAt || new Date().toISOString(), refId: null });
      }
    });
    var purchases = getAvoidedPurchases();
    purchases.forEach(function (p) {
      if (p.resolved !== undefined) return;
      p.resolved = !!p.destination;
      p.goalAmount = p.destination && p.destination !== "general" ? p.amount : 0;
      p.goalId = p.destination && p.destination !== "general" ? p.destination : null;
      p.unallocAmount = p.destination === "general" ? p.amount : 0;
      p.spentAmount = 0;
      if (p.destination === "general") unalloc.push({ id: uid("keep"), amount: p.amount, movedAmount: 0, note: "Avoided " + p.itemName, source: "avoided-purchase", date: p.date, at: p.createdAt || new Date().toISOString(), refId: p.id });
    });
    var decisions = getPurchaseDecisions();
    decisions.forEach(function (d) {
      if (d.status !== undefined) return;
      d.status = d.decision === "waiting" ? "waiting" : d.decision === "avoided" ? "avoided" : "bought";
      d.resolved = d.status === "avoided" ? !!d.destination : true;
      d.goalAmount = d.destination && d.destination !== "general" ? d.moneyAvoided : 0;
      d.goalId = d.destination && d.destination !== "general" ? d.destination : null;
      d.unallocAmount = d.destination === "general" ? d.moneyAvoided : 0;
      d.spentAmount = 0;
      if (d.status === "avoided" && d.destination === "general") unalloc.push({ id: uid("keep"), amount: d.moneyAvoided, movedAmount: 0, note: "Didn't buy " + d.itemName, source: "avoided-purchase", date: d.decidedAt ? d.decidedAt.slice(0, 10) : todayKey(), at: d.decidedAt || new Date().toISOString(), refId: d.id });
    });
    var logs = getMoneyDailyLogs();
    Object.keys(logs).forEach(function (dateKey) {
      Object.keys(logs[dateKey]).forEach(function (hid) {
        var e = logs[dateKey][hid];
        if (e.resolved !== undefined || !e.amountAvoided) return;
        e.resolved = !!e.destination;
        e.goalAmount = e.destination && e.destination !== "general" ? e.amountAvoided : 0;
        e.goalId = e.destination && e.destination !== "general" ? e.destination : null;
        e.unallocAmount = e.destination === "general" ? e.amountAvoided : 0;
        e.spentAmount = 0;
        if (e.destination === "general") unalloc.push({ id: uid("keep"), amount: e.amountAvoided, movedAmount: 0, note: "Habit reduction", source: "habit", date: dateKey, at: e.createdAt || new Date().toISOString(), refId: "log:" + hid + ":" + dateKey });
      });
    });
    saveContribs(contribs);
    saveUnalloc(unalloc);
    saveAvoidedPurchases(purchases);
    savePurchaseDecisions(decisions);
    saveMoneyDailyLogs(logs);
    localStorage.setItem("nc_money_v2", "1");
  }

  // A goal's saved amount is always the sum of its contributions.
  function syncGoals() {
    var goals = getMoneyGoals(), contribs = getContribs(), changed = false;
    goals.forEach(function (g) {
      var s = 0;
      contribs.forEach(function (c) { if (c.goalId === g.id) s += c.amount; });
      if (g.currentSavedAmount !== s) { g.currentSavedAmount = s; changed = true; }
      if (s >= g.targetAmount && !g.completedAt) { g.completedAt = new Date().toISOString(); g.celebrationSeen = false; changed = true; }
      else if (s < g.targetAmount && g.completedAt) { g.completedAt = null; g.celebrationSeen = false; changed = true; }
    });
    if (changed) saveMoneyGoals(goals);
    return goals;
  }
  function getGoal(id) { return getMoneyGoals().filter(function (g) { return g.id === id; })[0] || null; }
  function getActiveGoal() {
    var goals = getMoneyGoals();
    return goals.filter(function (g) { return !g.completedAt; })[0] || null;
  }
  function markGoalCelebrationSeen(goalId) {
    var goals = getMoneyGoals();
    goals.forEach(function (g) { if (g.id === goalId) g.celebrationSeen = true; });
    saveMoneyGoals(goals);
  }
  function createMoneyGoal(name, targetAmount) {
    var goals = getMoneyGoals();
    var goal = { id: uid("goal"), name: name, targetAmount: targetAmount, currentSavedAmount: 0, createdAt: new Date().toISOString(), completedAt: null, celebrationSeen: false };
    goals.push(goal);
    saveMoneyGoals(goals);
    return goal;
  }
  function goalPct(g) { return g.targetAmount ? Math.min(100, Math.floor((g.currentSavedAmount / g.targetAmount) * 100)) : 0; }

  function addContribution(goalId, amount, sourceKey, note, refId) {
    var list = getContribs();
    list.push({ id: uid("contrib"), goalId: goalId, amount: amount, source: sourceKey, sourceLabel: moneySourceLabel(sourceKey), note: note || "", date: todayKey(), at: new Date().toISOString(), refId: refId || null });
    saveContribs(list);
    syncGoals();
  }
  function unallocatedTotal() {
    var t = 0;
    getUnalloc().forEach(function (e) { t += e.amount - (e.movedAmount || 0); });
    return t;
  }

  // Removes whatever was previously allocated from one avoided-money event
  // (used when that event is re-decided or a check-in is edited).
  function moneyUnallocateRef(refId) {
    saveContribs(getContribs().filter(function (c) { return c.refId !== refId; }));
    saveUnalloc(getUnalloc().filter(function (e) { return e.refId !== refId; }));
    syncGoals();
  }

  // choice: "goal" | "spent" | "keep". requested = how much goes to the goal /
  // is kept; whatever is left of the avoided amount is recorded as spent elsewhere.
  function moneyAllocate(ctx, choice, goalId, requested) {
    moneyUnallocateRef(ctx.refId);
    var goalAmt = 0, keepAmt = 0;
    var req = Math.max(0, Math.min(ctx.amount, requested));
    if (choice === "goal") goalAmt = req;
    else if (choice === "keep") keepAmt = req;
    var spent = ctx.amount - goalAmt - keepAmt;
    if (goalAmt > 0) addContribution(goalId, goalAmt, ctx.sourceKey, ctx.label, ctx.refId);
    if (keepAmt > 0) {
      var u = getUnalloc();
      u.push({ id: uid("keep"), amount: keepAmt, movedAmount: 0, note: ctx.label, source: ctx.sourceKey, date: todayKey(), at: new Date().toISOString(), refId: ctx.refId });
      saveUnalloc(u);
    }
    var res = { goalAmount: goalAmt, goalId: goalAmt > 0 ? goalId : null, unallocAmount: keepAmt, spentAmount: spent, resolved: true };
    if (ctx.kind === "purchase") {
      var ps = getAvoidedPurchases();
      ps.forEach(function (p) { if (p.id === ctx.id) { for (var k in res) p[k] = res[k]; } });
      saveAvoidedPurchases(ps);
    } else if (ctx.kind === "decision") {
      var ds = getPurchaseDecisions();
      ds.forEach(function (d) { if (d.id === ctx.id) { for (var k in res) d[k] = res[k]; } });
      savePurchaseDecisions(ds);
    } else if (ctx.kind === "habit") {
      var e = getDailyLogEntry(ctx.habitId, ctx.dateKey);
      if (e) { for (var k in res) e[k] = res[k]; saveDailyLogEntry(ctx.habitId, ctx.dateKey, e); }
    }
    return res;
  }

  // Avoided money the user hasn't yet said what happened to.
  function pendingAvoided() {
    var out = [];
    getAvoidedPurchases().forEach(function (p) {
      if (!p.resolved && p.amount > 0) out.push({ label: "Avoided " + p.itemName, ctx: { kind: "purchase", id: p.id, refId: p.id, amount: p.amount, label: "Avoided " + p.itemName + " purchase", sourceKey: "avoided-purchase" } });
    });
    getPurchaseDecisions().forEach(function (d) {
      if (d.status === "avoided" && !d.resolved && d.moneyAvoided > 0) out.push({ label: "Didn't buy " + d.itemName, ctx: { kind: "decision", id: d.id, refId: d.id, amount: d.moneyAvoided, label: "Didn't buy " + d.itemName, sourceKey: "avoided-purchase" } });
    });
    var habits = getMoneyHabits();
    var logs = getMoneyDailyLogs();
    Object.keys(logs).forEach(function (dateKey) {
      Object.keys(logs[dateKey]).forEach(function (hid) {
        var e = logs[dateKey][hid];
        if (e.resolved || !e.amountAvoided) return;
        var h = habits.filter(function (x) { return x.id === hid; })[0];
        if (!h) return;
        out.push({ label: "Reduced " + (h.customName || h.category), ctx: moneyHabitCtx(h, dateKey, e.amountAvoided) });
      });
    });
    return out;
  }
  function moneyHabitCtx(habit, dateKey, amount) {
    var smoke = habit.category === "Smoking" || habit.category === "Tobacco";
    return { kind: "habit", habitId: habit.id, dateKey: dateKey, refId: "log:" + habit.id + ":" + dateKey, amount: amount, label: smoke ? "Smoking reduction" : (habit.customName || habit.category) + " reduction", sourceKey: smoke ? "smoking" : "habit" };
  }

  // The single place money totals are computed for a date range (either bound
  // may be null). Keeps avoided / saved / spent / added-to-goals apart.
  function moneyStats(from, to) {
    function inR(k) { return !(from && k < from) && !(to && k > to); }
    var r = { avoided: 0, saved: 0, toGoals: 0, expenses: 0, spentElsewhere: 0, kept: 0 };
    var logs = getMoneyDailyLogs();
    Object.keys(logs).forEach(function (dateKey) {
      if (!inR(dateKey)) return;
      Object.keys(logs[dateKey]).forEach(function (hid) {
        var e = logs[dateKey][hid];
        r.avoided += e.amountAvoided || 0;
        r.spentElsewhere += e.spentAmount || 0;
      });
    });
    getAvoidedPurchases().forEach(function (p) {
      if (!inR(p.date)) return;
      r.avoided += p.amount || 0;
      r.spentElsewhere += p.spentAmount || 0;
    });
    getPurchaseDecisions().forEach(function (d) {
      if (d.status !== "avoided") return;
      var dk = d.decidedAt ? todayKey(new Date(d.decidedAt)) : null;
      if (!dk || !inR(dk)) return;
      r.avoided += d.moneyAvoided || 0;
      r.spentElsewhere += d.spentAmount || 0;
    });
    getContribs().forEach(function (c) {
      if (!inR(c.date)) return;
      r.toGoals += c.amount;
      if (c.source !== "unallocated") r.saved += c.amount;
    });
    getUnalloc().forEach(function (e) {
      if (!inR(e.date)) return;
      r.saved += e.amount;
      r.kept += e.amount;
    });
    getExpenses().forEach(function (x) { if (inR(x.date)) r.expenses += x.amount; });
    r.spent = r.expenses + r.spentElsewhere;
    return r;
  }

  function buildMoneyBack(content, onBack) {
    var backBtn = document.createElement("button");
    backBtn.className = "picker-step-back";
    backBtn.textContent = "← Back";
    backBtn.addEventListener("click", onBack);
    content.appendChild(backBtn);
  }

  function buildMoneyStepper(value, onChange, min, max) {
    var wrap = document.createElement("div");
    wrap.className = "money-quantity-stepper";
    var minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.textContent = "−";
    minusBtn.addEventListener("click", function () { onChange(Math.max(min, value - 1)); });
    var valEl = document.createElement("span");
    valEl.className = "value";
    valEl.textContent = value;
    var plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.textContent = "+";
    plusBtn.addEventListener("click", function () { onChange(Math.min(max, value + 1)); });
    wrap.appendChild(minusBtn);
    wrap.appendChild(valEl);
    wrap.appendChild(plusBtn);
    return wrap;
  }

  function renderMoneyWeekGraph() {
    var wrap = document.createElement("div");
    var today = todayKey();
    var dayTotals = getLastNDateKeys(7).slice().reverse().map(function (dateKey) {
      return { dateKey: dateKey, amount: moneyStats(dateKey, dateKey).saved };
    });
    var anyData = dayTotals.some(function (d) { return d.amount > 0; });
    if (!anyData) {
      wrap.appendChild(mEl("p", "progress-graph-empty", "Money you actually save will show here."));
      return wrap;
    }
    var row = document.createElement("div");
    row.className = "progress-graph-row";
    var maxAmount = Math.max.apply(null, dayTotals.map(function (d) { return d.amount; }).concat([1]));
    dayTotals.forEach(function (d) {
      var barWrap = document.createElement("div");
      barWrap.className = "progress-graph-bar-wrap";
      var bar = document.createElement("div");
      bar.className = "progress-graph-bar" + (d.amount > 0 ? " has-data" : "") + (d.dateKey === today ? " is-today" : "");
      bar.style.height = Math.max(4, (d.amount / maxAmount) * 70) + "px";
      var label = document.createElement("span");
      label.className = "progress-graph-label";
      label.textContent = new Date(d.dateKey + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3);
      barWrap.appendChild(bar);
      barWrap.appendChild(label);
      row.appendChild(barWrap);
    });
    wrap.appendChild(row);
    return wrap;
  }

  // -- Dashboard --

  function renderMoneyHabitCard(habit) {
    var card = mEl("div", "money-habit-card");
    card.appendChild(mEl("p", "name", (habit.customName || habit.category) + (habit.privacyEnabled ? " 🔒" : "")));
    var costs = moneyHabitCosts(habit);
    card.appendChild(mEl("p", "cost-line", fmtRupee(costs.daily) + "/day if unchanged · usual " + habit.normalDailyQuantity + "/day"));
    var todayEntry = getDailyLogEntry(habit.id, todayKey());
    var statusLine = mEl("p", "cost-line");
    if (todayEntry) {
      statusLine.textContent = todayEntry.amountAvoided > 0 ? "Today: avoided " + fmtRupee(todayEntry.amountAvoided) : "Today: no reduction recorded";
      statusLine.style.color = todayEntry.amountAvoided > 0 ? "var(--mint)" : "var(--muted)";
    } else statusLine.textContent = "Not checked in today";
    card.appendChild(statusLine);
    var row = mEl("div", "money-quick-actions");
    row.appendChild(mBtn(todayEntry ? "Update Check-in" : "Check In", "action-btn primary", function () {
      var existing = getDailyLogEntry(habit.id, todayKey());
      goMoneyScreen("habit-checkin", {
        habitId: habit.id,
        reduceBy: existing && existing.targetQuantity !== null && existing.targetQuantity !== undefined ? (existing.normalQuantity - existing.targetQuantity) : null,
        actualQuantity: existing ? existing.actualQuantity : null,
        phase: "input"
      });
    }));
    row.appendChild(mBtn("Edit", "action-btn", function () {
      goMoneyScreen("habit-setup", { step: 1, editHabitId: habit.id, data: { category: habit.category, customName: habit.customName, privacyEnabled: habit.privacyEnabled, normalDailyQuantity: habit.normalDailyQuantity, costPerUnit: habit.costPerUnit } });
    }));
    card.appendChild(row);
    return card;
  }

  function renderMoneyGoalCard(g) {
    var card = mEl("div", "money-habit-card");
    card.appendChild(mEl("p", "name", g.name + (g.completedAt ? " ✓" : "")));
    card.appendChild(mEl("p", "money-goal-amount", fmtRupee(g.currentSavedAmount) + " / " + fmtRupee(g.targetAmount)));
    var track = mEl("div", "plan-progress-track");
    var fill = mEl("div", "plan-progress-fill");
    fill.style.width = goalPct(g) + "%";
    track.appendChild(fill);
    card.appendChild(track);
    card.appendChild(mEl("p", "muted-line", goalPct(g) + "% · " + fmtRupee(Math.max(0, g.targetAmount - g.currentSavedAmount)) + " remaining"));
    var row = mEl("div", "money-quick-actions");
    row.appendChild(mBtn("Open", "action-btn primary", function () { goMoneyScreen("goal", { goalId: g.id }); }));
    row.appendChild(mBtn("+ Add Money", "action-btn", function () { goMoneyScreen("add-money", { goalId: g.id }); }));
    card.appendChild(row);
    return card;
  }

  function renderMoneyDashboard(content) {
    // things waiting on the user
    pendingAvoided().forEach(function (p) {
      var b = mEl("div", "money-wait-banner");
      var q = mEl("p", "", fmtRupee(p.ctx.amount) + " avoided (" + p.label + ") — what happened to this money?");
      q.style.margin = "0 0 8px";
      b.appendChild(q);
      b.appendChild(mBtn("Decide", "action-btn primary", function () { goMoneyScreen("allocate", { ctx: p.ctx, choice: null }); }));
      content.appendChild(b);
    });
    getPurchaseDecisions().filter(function (d) { return d.status === "later" || d.status === "waiting"; }).forEach(function (d) {
      var b = mEl("div", "money-wait-banner");
      var ready = d.status === "later" || (d.decideAfter && Date.now() >= d.decideAfter);
      var hrs = d.decideAfter ? Math.max(1, Math.ceil((d.decideAfter - Date.now()) / 3600000)) : 0;
      var q = mEl("p", "", (ready ? "Decide: " : "Waiting: ") + d.itemName + " (" + fmtRupee(d.amount) + ")" + (ready ? "" : " — ready in about " + hrs + "h"));
      q.style.margin = "0 0 8px";
      b.appendChild(q);
      b.appendChild(mBtn(ready ? "Review" : "Review anyway", "action-btn primary", function () { goMoneyScreen("should-i-buy", { phase: "check", decisionId: d.id }); }));
      content.appendChild(b);
    });

    // Savings goals
    content.appendChild(mEl("h2", "", "Savings Goals"));
    var goals = getMoneyGoals();
    if (!goals.length) {
      content.appendChild(mEl("p", "muted-line", "You haven't set a savings goal yet."));
    } else {
      goals.forEach(function (g) { content.appendChild(renderMoneyGoalCard(g)); });
    }
    content.appendChild(mBtn(goals.length ? "+ New goal" : "Create a Savings Goal", goals.length ? "btn btn-outline btn-full" : "btn btn-primary btn-full", function () { goMoneyScreen("new-goal"); }));

    var pool = unallocatedTotal();
    if (pool > 0) {
      var ub = mEl("div", "money-avoided-total");
      ub.style.marginTop = "12px";
      ub.appendChild(document.createTextNode("Unallocated savings: "));
      var us = mEl("strong", "", fmtRupee(pool));
      ub.appendChild(us);
      if (goals.length) {
        var mv = mBtn("Move to a goal", "priority-change-link", function () { goMoneyScreen("move-unalloc", {}); });
        ub.appendChild(document.createElement("br"));
        ub.appendChild(mv);
      }
      content.appendChild(ub);
    }

    // Actually saved vs avoided — kept apart
    var today = todayKey();
    var weekStart = getLastNDateKeys(7).slice(-1)[0];
    var monthStart = getLastNDateKeys(30).slice(-1)[0];
    var h = mEl("h2", "", "Actually saved");
    h.style.marginTop = "18px";
    content.appendChild(h);
    var grid = mEl("div", "money-stat-grid");
    [["Today", moneyStats(today, null).saved], ["This Week", moneyStats(weekStart, null).saved], ["This Month", moneyStats(monthStart, null).saved]].forEach(function (pair) {
      var tile = mEl("div", "money-stat-tile");
      tile.appendChild(mEl("span", "big", fmtRupee(pair[1])));
      tile.appendChild(mEl("span", "lbl", pair[0]));
      grid.appendChild(tile);
    });
    content.appendChild(grid);
    var all = moneyStats(null, null);
    var av = mEl("p", "money-avoided-total");
    av.appendChild(document.createTextNode("Avoided spending, all time: "));
    av.appendChild(mEl("strong", "", fmtRupee(all.avoided)));
    av.appendChild(document.createElement("br"));
    av.appendChild(mEl("span", "muted-line", "Avoided is not the same as saved. Only money you add to a goal or keep counts as saved."));
    content.appendChild(av);

    // habits
    var hh = mEl("h2", "", "My Money Habits");
    hh.style.marginTop = "18px";
    content.appendChild(hh);
    var habits = getMoneyHabits().filter(function (x) { return !x.archived; });
    if (!habits.length) content.appendChild(mEl("p", "muted-line", "Track a spending habit to see its real cost and reduce it."));
    else habits.forEach(function (habit) { content.appendChild(renderMoneyHabitCard(habit)); });
    content.appendChild(mBtn("+ Track a money habit", "btn btn-outline btn-full", function () {
      goMoneyScreen("habit-setup", { step: 1, data: { category: null, customName: "", privacyEnabled: false, normalDailyQuantity: null, costPerUnit: null } });
    }));

    // weekly
    var wh = mEl("h2", "", "Weekly Progress");
    wh.style.marginTop = "18px";
    content.appendChild(wh);
    content.appendChild(renderMoneyWeekGraph());
    content.appendChild(mBtn("View full weekly report", "priority-change-link", function () { goMoneyScreen("weekly-report"); }));

    // quick actions
    var qh = mEl("h2", "", "Quick Actions");
    qh.style.marginTop = "18px";
    content.appendChild(qh);
    var q = mEl("div", "money-quick-actions");
    q.appendChild(mBtn("+ I avoided a purchase", "preset-plan-chip", function () { goMoneyScreen("avoided-purchase", { itemName: "", amount: "" }); }));
    q.appendChild(mBtn("Should I buy this?", "preset-plan-chip", function () { goMoneyScreen("should-i-buy", { phase: "entry" }); }));
    q.appendChild(mBtn("Add money to savings", "preset-plan-chip", function () {
      if (!getMoneyGoals().length) { showToast("Create a savings goal first"); goMoneyScreen("new-goal", { returnTo: { screen: "add-money" } }); return; }
      goMoneyScreen("add-money", {});
    }));
    q.appendChild(mBtn("Log an expense", "preset-plan-chip", function () { goMoneyScreen("expense", {}); }));
    content.appendChild(q);
  }

  // -- New goal --

  function renderMoneyNewGoal(content) {
    var back = moneyView.returnTo;
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });
    content.appendChild(mEl("h2", "", "What are you saving for?"));
    var chipsWrap = mEl("div", "money-quick-actions");
    var chosenName = moneyView.goalName || "";
    MONEY_GOAL_PRESETS.forEach(function (preset) {
      chipsWrap.appendChild(mBtn(preset, "preset-plan-chip" + (chosenName === preset ? " active-chip" : ""), function () { moneyView.goalName = preset; renderDuniyaMoney(); }));
    });
    content.appendChild(chipsWrap);
    var cl = mEl("p", "muted-line", "Or name your own goal");
    cl.style.marginTop = "12px";
    content.appendChild(cl);
    var nameInput = mEl("input", "text-input");
    nameInput.type = "text";
    nameInput.placeholder = "e.g. New phone";
    nameInput.value = MONEY_GOAL_PRESETS.indexOf(chosenName) === -1 ? chosenName : "";
    nameInput.addEventListener("input", function () { moneyView.goalName = nameInput.value; });
    content.appendChild(nameInput);
    var al = mEl("p", "muted-line", "Target amount");
    al.style.marginTop = "12px";
    content.appendChild(al);
    content.appendChild(mNumInput("₹50000", moneyView.goalAmount, function (v) { moneyView.goalAmount = v; }));
    var save = mBtn("Save Goal", "btn btn-primary btn-full", function () {
      var name = (moneyView.goalName || "").trim();
      var amount = parseFloat(moneyView.goalAmount);
      if (!name) { showToast("Give your goal a name"); return; }
      if (!amount || amount <= 0) { showToast("Enter a target amount"); return; }
      var g = createMoneyGoal(name, amount);
      showToast("Savings goal created");
      if (back) goMoneyScreen(back.screen, back.extra || { goalId: g.id });
      else goMoneyScreen("goal", { goalId: g.id });
    });
    save.style.marginTop = "14px";
    content.appendChild(save);
  }

  // -- Goal screen --

  function renderMoneyGoal(content) {
    var g = getGoal(moneyView.goalId);
    if (!g) { goMoneyScreen("dashboard"); return; }
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });
    content.appendChild(mEl("h2", "", g.name));
    var amt = mEl("p", "money-goal-amount", fmtRupee(g.currentSavedAmount) + " saved");
    content.appendChild(amt);
    var track = mEl("div", "plan-progress-track");
    var fill = mEl("div", "plan-progress-fill");
    fill.style.width = goalPct(g) + "%";
    track.appendChild(fill);
    content.appendChild(track);
    content.appendChild(mRows([
      ["Target", fmtRupee(g.targetAmount)],
      ["Actually saved", fmtRupee(g.currentSavedAmount)],
      ["Remaining", fmtRupee(Math.max(0, g.targetAmount - g.currentSavedAmount))],
      ["Progress", goalPct(g) + "% complete", true]
    ]));
    if (g.completedAt) content.appendChild(mEl("p", "rec-note", "🎉 You reached this goal."));
    var add = mBtn("+ Add Money", "btn btn-primary btn-full", function () { goMoneyScreen("add-money", { goalId: g.id, fromGoal: true }); });
    content.appendChild(add);
    if (unallocatedTotal() > 0) {
      content.appendChild(mBtn("Move unallocated savings here (" + fmtRupee(unallocatedTotal()) + ")", "btn btn-outline btn-full", function () { goMoneyScreen("move-unalloc", { goalId: g.id }); }));
    }
    var rh = mEl("h2", "", "Recent activity");
    rh.style.marginTop = "16px";
    content.appendChild(rh);
    var recent = getContribs().filter(function (c) { return c.goalId === g.id; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 10);
    if (!recent.length) content.appendChild(mEl("p", "muted-line", "Nothing added yet. This only grows when you confirm money went in."));
    recent.forEach(function (c) {
      var d = new Date(c.date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
      var line = mEl("p", "muted-line", "+ " + fmtRupee(c.amount) + " — " + (c.note || c.sourceLabel) + " · " + d);
      line.style.marginBottom = "4px";
      content.appendChild(line);
    });
  }

  // -- Add money manually --

  function renderMoneyAddMoney(content) {
    var goals = getMoneyGoals();
    if (!goals.length) { goMoneyScreen("new-goal", { returnTo: { screen: "add-money" } }); return; }
    if (!moneyView.goalId) moneyView.goalId = goals[0].id;
    buildMoneyBack(content, function () { goMoneyScreen(moneyView.fromGoal ? "goal" : "dashboard", { goalId: moneyView.goalId }); });
    content.appendChild(mEl("h2", "", "How much are you adding?"));
    content.appendChild(mNumInput("₹500", moneyView.amount, function (v) { moneyView.amount = v; }));
    if (goals.length > 1) {
      var gl = mEl("p", "muted-line", "Which goal?");
      gl.style.marginTop = "12px";
      content.appendChild(gl);
      var chips = mEl("div", "money-quick-actions");
      goals.forEach(function (g) {
        chips.appendChild(mBtn(g.name + " — " + fmtRupee(g.currentSavedAmount) + " / " + fmtRupee(g.targetAmount), "preset-plan-chip" + (moneyView.goalId === g.id ? " active-chip" : ""), function () { moneyView.goalId = g.id; renderDuniyaMoney(); }));
      });
      content.appendChild(chips);
    } else {
      var only = mEl("p", "muted-line", "Goal: " + goals[0].name);
      only.style.marginTop = "8px";
      content.appendChild(only);
    }
    var sl = mEl("p", "muted-line", "Where did this money come from? (optional)");
    sl.style.marginTop = "12px";
    content.appendChild(sl);
    var srow = mEl("div", "money-quick-actions");
    MONEY_SOURCES.forEach(function (s) {
      srow.appendChild(mBtn(s.label, "preset-plan-chip" + (moneyView.source === s.key ? " active-chip" : ""), function () { moneyView.source = moneyView.source === s.key ? null : s.key; renderDuniyaMoney(); }));
    });
    content.appendChild(srow);
    var save = mBtn("Add to goal", "btn btn-primary btn-full", function () {
      var amount = parseFloat(moneyView.amount);
      if (!amount || amount <= 0) { showToast("Enter an amount"); return; }
      var g = getGoal(moneyView.goalId);
      addContribution(g.id, amount, moneyView.source || "manual", "", null);
      goMoneyScreen("alloc-done", { kind: "goal", amount: amount, goalId: g.id });
    });
    save.style.marginTop = "14px";
    content.appendChild(save);
  }

  // -- Log an expense --

  function renderMoneyExpense(content) {
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });
    content.appendChild(mEl("h2", "", "Log an expense"));
    content.appendChild(mNumInput("₹ amount", moneyView.amount, function (v) { moneyView.amount = v; }));
    var l = mEl("input", "text-input");
    l.type = "text";
    l.placeholder = "What was it for? (optional)";
    l.value = moneyView.label || "";
    l.addEventListener("input", function () { moneyView.label = l.value; });
    content.appendChild(l);
    var save = mBtn("Save expense", "btn btn-primary btn-full", function () {
      var amount = parseFloat(moneyView.amount);
      if (!amount || amount <= 0) { showToast("Enter an amount"); return; }
      var list = getExpenses();
      list.push({ id: uid("exp"), amount: amount, label: (moneyView.label || "").trim().slice(0, 60), date: todayKey(), at: new Date().toISOString(), refId: null });
      saveExpenses(list);
      showToast(fmtRupee(amount) + " logged");
      goMoneyScreen("expense", {});
    });
    save.style.marginTop = "6px";
    content.appendChild(save);
    var recent = getExpenses().slice().sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 5);
    if (recent.length) {
      var rh = mEl("h2", "", "Recent expenses");
      rh.style.marginTop = "18px";
      content.appendChild(rh);
      recent.forEach(function (x) {
        var line = mEl("p", "muted-line", fmtRupee(x.amount) + (x.label ? " — " + x.label : "") + " · " + new Date(x.date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }));
        line.style.marginBottom = "4px";
        content.appendChild(line);
      });
    }
  }

  // -- "What happened to this money?" (used by every avoided-money flow) --

  function renderMoneyAllocate(content) {
    var ctx = moneyView.ctx;
    if (!ctx) { goMoneyScreen("dashboard"); return; }
    var goals = getMoneyGoals();
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });
    content.appendChild(mEl("h2", "", "You avoided spending " + fmtRupee(ctx.amount) + "."));
    if (ctx.note) content.appendChild(mEl("p", "muted-line", ctx.note));
    content.appendChild(mEl("p", "muted-line", "This isn't counted as saved yet."));
    var q = mEl("p", "", "What happened to this " + fmtRupee(ctx.amount) + "?");
    q.style.fontWeight = "600";
    q.style.margin = "12px 0 8px";
    content.appendChild(q);

    function opt(key, label) {
      var b = mBtn(label, "rec-action" + (moneyView.choice === key ? " done" : ""), function () { moneyView.choice = key; renderDuniyaMoney(); });
      content.appendChild(b);
    }
    opt("goal", "Add " + fmtRupee(ctx.amount) + " to my savings goal");
    opt("spent", "I spent this money somewhere else");
    opt("keep", "I kept the money, but don't want to add it to a goal yet");

    var choice = moneyView.choice;
    if (choice === "goal") {
      if (!goals.length) {
        content.appendChild(mEl("p", "muted-line", "You need a savings goal first."));
        content.appendChild(mBtn("Create a savings goal", "btn btn-outline btn-full", function () { goMoneyScreen("new-goal", { returnTo: { screen: "allocate", extra: { ctx: ctx, choice: "goal" } } }); }));
        return;
      }
      if (!moneyView.goalId) moneyView.goalId = goals[0].id;
      content.appendChild(mEl("p", "muted-line", "Which savings goal?"));
      goals.forEach(function (g) {
        content.appendChild(mBtn((moneyView.goalId === g.id ? "● " : "○ ") + g.name + " — " + fmtRupee(g.currentSavedAmount) + " / " + fmtRupee(g.targetAmount), "rec-action" + (moneyView.goalId === g.id ? " done" : ""), function () { moneyView.goalId = g.id; renderDuniyaMoney(); }));
      });
    }
    if (choice === "goal" || choice === "keep") {
      var lbl = mEl("p", "muted-line", "How much of it? (the rest is recorded as spent elsewhere)");
      lbl.style.marginTop = "8px";
      content.appendChild(lbl);
      if (moneyView.amountStr === undefined) moneyView.amountStr = String(ctx.amount);
      content.appendChild(mNumInput(fmtRupee(ctx.amount), moneyView.amountStr, function (v) { moneyView.amountStr = v; }));
    }
    if (choice) {
      var confirm = mBtn(choice === "goal" ? "Add to goal" : choice === "keep" ? "Keep as unallocated savings" : "Record", "btn btn-primary btn-full", function () {
        var amt = choice === "spent" ? 0 : parseFloat(moneyView.amountStr);
        if (choice !== "spent" && (!amt || amt <= 0)) { showToast("Enter an amount"); return; }
        if (choice !== "spent" && amt > ctx.amount) { showToast("That's more than " + fmtRupee(ctx.amount)); return; }
        var res = moneyAllocate(ctx, choice, moneyView.goalId, amt);
        goMoneyScreen("alloc-done", { kind: choice, ctx: ctx, res: res, goalId: res.goalId });
      });
      confirm.style.marginTop = "12px";
      content.appendChild(confirm);
    }
  }

  function renderMoneyAllocDone(content) {
    var v = moneyView;
    var g = v.goalId ? getGoal(v.goalId) : null;
    if (v.kind === "goal" && !v.ctx) {
      content.appendChild(mEl("h2", "", fmtRupee(v.amount) + " added to your " + (g ? g.name : "savings") + " goal."));
    } else if (v.kind === "goal") {
      content.appendChild(mEl("h2", "", fmtRupee(v.res.goalAmount) + " added to your " + (g ? g.name : "savings") + " goal."));
      if (v.res.spentAmount > 0) content.appendChild(mEl("p", "muted-line", "The other " + fmtRupee(v.res.spentAmount) + " is recorded as spent elsewhere."));
    } else if (v.kind === "keep") {
      content.appendChild(mEl("h2", "", fmtRupee(v.res.unallocAmount) + " kept as unallocated savings."));
      content.appendChild(mEl("p", "muted-line", "You can move it into a goal any time." + (v.res.spentAmount > 0 ? " The other " + fmtRupee(v.res.spentAmount) + " is recorded as spent elsewhere." : "")));
    } else if (v.kind === "moved") {
      content.appendChild(mEl("h2", "", fmtRupee(v.amount) + " moved to your " + (g ? g.name : "savings") + " goal."));
    } else {
      content.appendChild(mEl("h2", "", "Recorded."));
      content.appendChild(mEl("p", "muted-line", "Avoided purchase: " + fmtRupee(v.ctx.amount) + ". Saved toward a goal: ₹0."));
    }
    if (g) {
      content.appendChild(mRows([
        [g.name, fmtRupee(g.currentSavedAmount) + " / " + fmtRupee(g.targetAmount), true],
        ["Remaining", fmtRupee(Math.max(0, g.targetAmount - g.currentSavedAmount))]
      ]));
    }
    var done = mBtn("Done", "btn btn-primary btn-full", function () { goMoneyScreen("dashboard"); });
    done.style.marginTop = "12px";
    content.appendChild(done);
    if (g) content.appendChild(mBtn("View " + g.name + " goal", "btn btn-outline btn-full", function () { goMoneyScreen("goal", { goalId: g.id }); }));
  }

  // -- Move unallocated savings into a goal --

  function renderMoneyMoveUnalloc(content) {
    var goals = getMoneyGoals();
    var pool = unallocatedTotal();
    if (!goals.length || pool <= 0) { goMoneyScreen("dashboard"); return; }
    if (!moneyView.goalId) moneyView.goalId = goals[0].id;
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });
    content.appendChild(mEl("h2", "", "Move unallocated savings"));
    content.appendChild(mEl("p", "muted-line", "Available: " + fmtRupee(pool)));
    goals.forEach(function (g) {
      content.appendChild(mBtn((moneyView.goalId === g.id ? "● " : "○ ") + g.name + " — " + fmtRupee(g.currentSavedAmount) + " / " + fmtRupee(g.targetAmount), "rec-action" + (moneyView.goalId === g.id ? " done" : ""), function () { moneyView.goalId = g.id; renderDuniyaMoney(); }));
    });
    if (moneyView.amountStr === undefined) moneyView.amountStr = String(pool);
    content.appendChild(mNumInput("How much?", moneyView.amountStr, function (v) { moneyView.amountStr = v; }));
    var go = mBtn("Move to goal", "btn btn-primary btn-full", function () {
      var amt = parseFloat(moneyView.amountStr);
      if (!amt || amt <= 0) { showToast("Enter an amount"); return; }
      if (amt > pool) { showToast("You only have " + fmtRupee(pool) + " unallocated"); return; }
      var left = amt;
      var list = getUnalloc();
      list.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
      list.forEach(function (e) {
        var avail = e.amount - (e.movedAmount || 0);
        if (left <= 0 || avail <= 0) return;
        var take = Math.min(avail, left);
        e.movedAmount = (e.movedAmount || 0) + take;
        left -= take;
      });
      saveUnalloc(list);
      addContribution(moneyView.goalId, amt, "unallocated", "Moved from unallocated savings", null);
      goMoneyScreen("alloc-done", { kind: "moved", amount: amt, goalId: moneyView.goalId });
    });
    go.style.marginTop = "12px";
    content.appendChild(go);
  }

  // -- Habit setup (4-step) --

  function renderMoneyHabitSetup(content) {
    var step = moneyView.step || 1;
    var d = moneyView.data;

    buildMoneyBack(content, function () {
      if (step > 1) { moneyView.step = step - 1; renderDuniyaMoney(); }
      else goMoneyScreen("dashboard");
    });
    var stepLine = document.createElement("p");
    stepLine.className = "muted-line";
    stepLine.textContent = "Step " + step + " of 4";
    content.appendChild(stepLine);

    if (step === 1) {
      var h2 = document.createElement("h2");
      h2.textContent = "What habit do you want to reduce?";
      content.appendChild(h2);
      var chipsWrap = document.createElement("div");
      chipsWrap.className = "money-quick-actions";
      MONEY_HABIT_CATEGORIES.forEach(function (cat) {
        var chip = document.createElement("button");
        chip.className = "preset-plan-chip" + (d.category === cat ? " active-chip" : "");
        chip.textContent = cat;
        chip.addEventListener("click", function () { d.category = cat; renderDuniyaMoney(); });
        chipsWrap.appendChild(chip);
      });
      content.appendChild(chipsWrap);

      var nameLabel = document.createElement("p");
      nameLabel.className = "muted-line";
      nameLabel.style.marginTop = "12px";
      nameLabel.textContent = "Give it a private name (optional)";
      content.appendChild(nameLabel);
      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "text-input";
      nameInput.placeholder = "e.g. Habit A";
      nameInput.value = d.customName || "";
      nameInput.addEventListener("input", function () { d.customName = nameInput.value; });
      content.appendChild(nameInput);

      var privacyRow = document.createElement("label");
      privacyRow.className = "money-checkbox-row";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!d.privacyEnabled;
      cb.addEventListener("change", function () { d.privacyEnabled = cb.checked; });
      privacyRow.appendChild(cb);
      var cbLabel = document.createElement("span");
      cbLabel.textContent = "Keep this private (show only the name above)";
      privacyRow.appendChild(cbLabel);
      content.appendChild(privacyRow);

      var nextBtn = document.createElement("button");
      nextBtn.className = "btn btn-primary btn-full";
      nextBtn.style.marginTop = "14px";
      nextBtn.textContent = "Next";
      nextBtn.addEventListener("click", function () {
        if (!d.category) { showToast("Choose a category"); return; }
        if (d.category === "Other / Custom" && !(d.customName || "").trim()) { showToast("Give this habit a name"); return; }
        moneyView.step = 2; renderDuniyaMoney();
      });
      content.appendChild(nextBtn);
    } else if (step === 2) {
      var h2b = document.createElement("h2");
      h2b.textContent = "How many times/items per day?";
      content.appendChild(h2b);
      content.appendChild(buildMoneyStepper(d.normalDailyQuantity || 1, function (v) { d.normalDailyQuantity = v; renderDuniyaMoney(); }, 1, 100));
      var nextBtn2 = document.createElement("button");
      nextBtn2.className = "btn btn-primary btn-full";
      nextBtn2.style.marginTop = "14px";
      nextBtn2.textContent = "Next";
      nextBtn2.addEventListener("click", function () {
        if (!d.normalDailyQuantity) d.normalDailyQuantity = 1;
        moneyView.step = 3; renderDuniyaMoney();
      });
      content.appendChild(nextBtn2);
    } else if (step === 3) {
      var h2c = document.createElement("h2");
      h2c.textContent = "Average cost each time?";
      content.appendChild(h2c);
      var costInput = document.createElement("input");
      costInput.type = "number";
      costInput.min = "0";
      costInput.className = "text-input";
      costInput.placeholder = "₹20";
      costInput.value = d.costPerUnit || "";
      var previewHolder = document.createElement("div");
      function renderMoneyCostPreview() {
        previewHolder.innerHTML = "";
        if (!d.normalDailyQuantity || !d.costPerUnit) return;
        var costs = moneyHabitCosts({ normalDailyQuantity: d.normalDailyQuantity, costPerUnit: d.costPerUnit });
        var box = document.createElement("div");
        box.className = "money-cost-breakdown";
        box.innerHTML =
          '<div class="row highlight"><span>' + d.normalDailyQuantity + ' × ₹' + d.costPerUnit + '</span><span>' + fmtRupee(costs.daily) + '/day</span></div>' +
          '<div class="row"><span>Per week</span><span>≈ ' + fmtRupee(costs.weekly) + '</span></div>' +
          '<div class="row"><span>Per 30 days</span><span>≈ ' + fmtRupee(costs.monthly) + '</span></div>' +
          '<div class="row"><span>Per year</span><span>≈ ' + fmtRupee(costs.yearly) + '</span></div>';
        previewHolder.appendChild(box);
      }
      costInput.addEventListener("input", function () { d.costPerUnit = parseFloat(costInput.value) || 0; renderMoneyCostPreview(); });
      content.appendChild(costInput);
      content.appendChild(previewHolder);
      renderMoneyCostPreview();

      var nextBtn3 = document.createElement("button");
      nextBtn3.className = "btn btn-primary btn-full";
      nextBtn3.style.marginTop = "14px";
      nextBtn3.textContent = "Next";
      nextBtn3.addEventListener("click", function () {
        if (!d.costPerUnit || d.costPerUnit <= 0) { showToast("Enter a cost"); return; }
        moneyView.step = 4; renderDuniyaMoney();
      });
      content.appendChild(nextBtn3);
    } else if (step === 4) {
      var h2d = document.createElement("h2");
      h2d.textContent = "What would you rather do with some of this money?";
      content.appendChild(h2d);
      var goal = getActiveGoal();
      if (goal && !goal.completedAt) {
        var goalP = document.createElement("p");
        goalP.className = "muted-line";
        goalP.textContent = "Money you save from this habit can go toward:";
        content.appendChild(goalP);
        var goalName = document.createElement("p");
        goalName.className = "money-goal-name";
        goalName.textContent = goal.name + " (" + fmtRupee(goal.currentSavedAmount) + " / " + fmtRupee(goal.targetAmount) + ")";
        content.appendChild(goalName);
      } else {
        var noGoalP2 = document.createElement("p");
        noGoalP2.className = "muted-line";
        noGoalP2.textContent = "You don't have a saving goal yet — you can still track this habit, and create a goal any time from the dashboard.";
        content.appendChild(noGoalP2);
      }
      var saveHabitBtn = document.createElement("button");
      saveHabitBtn.className = "btn btn-primary btn-full";
      saveHabitBtn.style.marginTop = "14px";
      saveHabitBtn.textContent = moneyView.editHabitId ? "Save Changes" : "Start Tracking";
      saveHabitBtn.addEventListener("click", function () {
        var habits = getMoneyHabits();
        if (moneyView.editHabitId) {
          var existing = habits.find(function (h) { return h.id === moneyView.editHabitId; });
          if (existing) {
            existing.category = d.category;
            existing.customName = (d.customName || "").trim();
            existing.privacyEnabled = !!d.privacyEnabled;
            existing.normalDailyQuantity = d.normalDailyQuantity;
            existing.costPerUnit = d.costPerUnit;
          }
        } else {
          habits.push({
            id: uid("habit"), category: d.category, customName: (d.customName || "").trim(),
            privacyEnabled: !!d.privacyEnabled, normalDailyQuantity: d.normalDailyQuantity,
            costPerUnit: d.costPerUnit, targetDailyQuantity: null, createdAt: new Date().toISOString(), archived: false
          });
        }
        saveMoneyHabits(habits);
        showToast(moneyView.editHabitId ? "Habit updated" : "Now tracking this habit");
        goMoneyScreen("dashboard");
      });
      content.appendChild(saveHabitBtn);
    }
  }

  // -- Daily check-in --

  function renderMoneyHabitCheckin(content) {
    var habit = getMoneyHabits().find(function (h) { return h.id === moneyView.habitId; });
    if (!habit) { goMoneyScreen("dashboard"); return; }
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });
    content.appendChild(mEl("h2", "", (habit.customName || habit.category) + " — Check In"));

    if (moneyView.phase === "none") {
      var b = mEl("div", "money-result-banner neutral");
      b.appendChild(mEl("p", "", "No reduction recorded today. You can try again tomorrow."));
      content.appendChild(b);
      content.appendChild(mBtn("Done", "btn btn-primary btn-full", function () { goMoneyScreen("dashboard"); }));
      return;
    }

    content.appendChild(mEl("p", "muted-line", "Usual amount: " + habit.normalDailyQuantity + "/day"));
    var tl = mEl("p", "muted-line", "Today I want to reduce by (optional)");
    tl.style.marginTop = "12px";
    content.appendChild(tl);
    var chips = mEl("div", "money-quick-actions");
    [1, 2, 3].forEach(function (n) {
      chips.appendChild(mBtn("-" + n, "preset-plan-chip" + (moneyView.reduceBy === n ? " active-chip" : ""), function () {
        moneyView.reduceBy = n;
        moneyView.actualQuantity = Math.max(0, habit.normalDailyQuantity - n);
        renderDuniyaMoney();
      }));
    });
    chips.appendChild(mBtn("No target", "preset-plan-chip" + (!moneyView.reduceBy ? " active-chip" : ""), function () { moneyView.reduceBy = null; renderDuniyaMoney(); }));
    content.appendChild(chips);
    var ql = mEl("p", "muted-line", "How many did you use/buy today?");
    ql.style.marginTop = "14px";
    content.appendChild(ql);
    var actualQ = (moneyView.actualQuantity !== null && moneyView.actualQuantity !== undefined) ? moneyView.actualQuantity : habit.normalDailyQuantity;
    content.appendChild(buildMoneyStepper(actualQ, function (v) { moneyView.actualQuantity = v; renderDuniyaMoney(); }, 0, 200));

    var save = mBtn("Save Check-in", "btn btn-primary btn-full", function () {
      var normal = habit.normalDailyQuantity;
      var avoided = Math.max(0, (normal - actualQ) * habit.costPerUnit);
      var targetBeaten = moneyView.reduceBy ? (normal - actualQ) > moneyView.reduceBy : false;
      var dateKey = todayKey();
      var ctx = moneyHabitCtx(habit, dateKey, avoided);
      moneyUnallocateRef(ctx.refId);
      saveDailyLogEntry(habit.id, dateKey, {
        habitId: habit.id, date: dateKey, normalQuantity: normal, actualQuantity: actualQ,
        targetQuantity: moneyView.reduceBy ? Math.max(0, normal - moneyView.reduceBy) : null,
        amountAvoided: avoided, resolved: avoided === 0, goalAmount: 0, goalId: null, unallocAmount: 0, spentAmount: 0,
        createdAt: new Date().toISOString()
      });
      if (avoided > 0) {
        ctx.note = targetBeaten ? "Target beaten 🎯" : null;
        goMoneyScreen("allocate", { ctx: ctx, choice: null });
      } else {
        moneyView.phase = "none";
        renderDuniyaMoney();
      }
    });
    save.style.marginTop = "14px";
    content.appendChild(save);
  }

  // -- "I avoided a purchase" --

  function renderMoneyAvoidedPurchase(content) {
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });
    content.appendChild(mEl("h2", "", "What did you avoid buying?"));
    var name = mEl("input", "text-input");
    name.type = "text";
    name.placeholder = "e.g. Shoes";
    name.value = moneyView.itemName || "";
    name.addEventListener("input", function () { moneyView.itemName = name.value; });
    content.appendChild(name);
    var al = mEl("p", "muted-line", "How much would it have cost?");
    al.style.marginTop = "12px";
    content.appendChild(al);
    content.appendChild(mNumInput("₹800", moneyView.amount, function (v) { moneyView.amount = v; }));
    var go = mBtn("Continue", "btn btn-primary btn-full", function () {
      var item = (moneyView.itemName || "").trim();
      var amount = parseFloat(moneyView.amount);
      if (!item) { showToast("What did you avoid buying?"); return; }
      if (!amount || amount <= 0) { showToast("Enter an amount"); return; }
      var rec = { id: uid("avoid"), itemName: item, amount: amount, date: todayKey(), at: new Date().toISOString(), resolved: false, goalAmount: 0, goalId: null, unallocAmount: 0, spentAmount: 0 };
      var list = getAvoidedPurchases();
      list.push(rec);
      saveAvoidedPurchases(list);
      goMoneyScreen("allocate", { ctx: { kind: "purchase", id: rec.id, refId: rec.id, amount: amount, label: "Avoided " + item + " purchase", sourceKey: "avoided-purchase" }, choice: null });
    });
    go.style.marginTop = "14px";
    content.appendChild(go);
  }

  // -- "Should I buy this?" --

  function saveDecision(status, extra) {
    var list = getPurchaseDecisions();
    var rec = moneyView.decisionId ? list.filter(function (d) { return d.id === moneyView.decisionId; })[0] : null;
    if (!rec) {
      rec = { id: uid("decision"), itemName: moneyView.itemNameFinal, amount: moneyView.priceNum, needOrWant: moneyView.needOrWant, createdAt: new Date().toISOString(), moneyAvoided: 0, resolved: true, goalAmount: 0, goalId: null, unallocAmount: 0, spentAmount: 0 };
      list.push(rec);
    }
    rec.needOrWant = moneyView.needOrWant;
    rec.checks = moneyView.checks || {};
    rec.status = status;
    rec.decideAfter = null;
    for (var k in (extra || {})) rec[k] = extra[k];
    savePurchaseDecisions(list);
    return rec;
  }

  function renderMoneyShouldIBuy(content) {
    if (moneyView.decisionId && !moneyView.itemNameFinal) {
      var loaded = getPurchaseDecisions().filter(function (d) { return d.id === moneyView.decisionId; })[0];
      if (!loaded) { goMoneyScreen("dashboard"); return; }
      moneyView.itemNameFinal = loaded.itemName;
      moneyView.priceNum = loaded.amount;
      moneyView.needOrWant = loaded.needOrWant;
      moneyView.checks = loaded.checks || {};
    }
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });

    if (moneyView.phase === "done") {
      content.appendChild(mEl("h2", "", "Saved"));
      content.appendChild(mEl("p", "muted-line", moneyView.doneMessage || "Noted."));
      var d1 = mBtn("Back to Money Habits", "btn btn-primary btn-full", function () { goMoneyScreen("dashboard"); });
      d1.style.marginTop = "12px";
      content.appendChild(d1);
      return;
    }

    if (moneyView.phase === "bought") {
      content.appendChild(mEl("h2", "", "You bought " + moneyView.itemNameFinal + "."));
      content.appendChild(mEl("p", "muted-line", "Want to record the " + fmtRupee(moneyView.priceNum) + " as an expense so your weekly report stays accurate?"));
      var ex = mBtn("Log " + fmtRupee(moneyView.priceNum) + " as an expense", "btn btn-primary btn-full", function () {
        var list = getExpenses();
        list.push({ id: uid("exp"), amount: moneyView.priceNum, label: moneyView.itemNameFinal, date: todayKey(), at: new Date().toISOString(), refId: "decision:" + moneyView.boughtId });
        saveExpenses(list);
        showToast("Expense logged");
        goMoneyScreen("dashboard");
      });
      ex.style.marginTop = "12px";
      content.appendChild(ex);
      content.appendChild(mBtn("Not now", "btn btn-outline btn-full", function () { goMoneyScreen("dashboard"); }));
      return;
    }

    if (moneyView.phase === "check") {
      var isNeed = moneyView.needOrWant === "Need";
      content.appendChild(mEl("h2", "", moneyView.itemNameFinal + " — " + fmtRupee(moneyView.priceNum)));
      content.appendChild(mEl("p", "muted-line", moneyView.needOrWant + ". A quick check before you decide:"));
      moneyView.checks = moneyView.checks || {};
      function question(key, text, info) {
        var qp = mEl("p", "", text);
        qp.style.fontWeight = "600";
        qp.style.margin = "14px 0 4px";
        content.appendChild(qp);
        if (info) content.appendChild(mEl("p", "muted-line", info));
        var row = mEl("div", "money-quick-actions");
        ["Yes", "No", "Not sure"].forEach(function (a) {
          row.appendChild(mBtn(a, "preset-plan-chip" + (moneyView.checks[key] === a ? " active-chip" : ""), function () { moneyView.checks[key] = a; renderDuniyaMoney(); }));
        });
        content.appendChild(row);
      }
      question("afford", "Can you afford it without touching essential money?", null);
      var goals = getMoneyGoals().filter(function (g) { return !g.completedAt; });
      var info = goals.length ? goals.map(function (g) {
        var left = Math.max(0, g.targetAmount - g.currentSavedAmount);
        return g.name + ": " + fmtRupee(left) + " still to save. This costs " + (left ? Math.round((moneyView.priceNum / left) * 100) + "% of that." : "more than what's left.");
      }).join(" ") : "You have no savings goals yet.";
      question("delay", "Does buying it delay one of your savings goals?", info);
      question("stillWant", "Do you still want it after thinking about it?", null);

      var buy = mBtn("Buy it", "btn btn-primary btn-full", function () {
        var rec = saveDecision("bought", { decidedAt: new Date().toISOString(), moneyAvoided: 0, resolved: true });
        goMoneyScreen("should-i-buy", { phase: "bought", itemNameFinal: rec.itemName, priceNum: rec.amount, boughtId: rec.id });
      });
      buy.style.marginTop = "16px";
      content.appendChild(buy);
      content.appendChild(mBtn("Don't buy it", "btn btn-outline btn-full", function () {
        var rec = saveDecision("avoided", { decidedAt: new Date().toISOString(), moneyAvoided: moneyView.priceNum, resolved: false });
        goMoneyScreen("allocate", { ctx: { kind: "decision", id: rec.id, refId: rec.id, amount: rec.amount, label: "Didn't buy " + rec.itemName, sourceKey: "avoided-purchase" }, choice: null });
      }));
      content.appendChild(mBtn("Decide later", "btn btn-outline btn-full", function () {
        saveDecision("later", {});
        goMoneyScreen("should-i-buy", { phase: "done", doneMessage: "It's saved under Money Habits. Come back to it when you're ready." });
      }));
      if (!isNeed) {
        content.appendChild(mBtn("Wait 24 hours before deciding", "priority-change-link", function () {
          saveDecision("waiting", { decideAfter: Date.now() + 24 * 3600000 });
          goMoneyScreen("should-i-buy", { phase: "done", doneMessage: "We'll show it on your Money Habits home once 24 hours have passed." });
        }));
      }
      return;
    }

    // entry
    content.appendChild(mEl("h2", "", "What do you want to buy?"));
    var item = mEl("input", "text-input");
    item.type = "text";
    item.placeholder = "e.g. Wireless earbuds";
    item.value = moneyView.itemName || "";
    item.addEventListener("input", function () { moneyView.itemName = item.value; });
    content.appendChild(item);
    var pl = mEl("p", "muted-line", "Price?");
    pl.style.marginTop = "10px";
    content.appendChild(pl);
    content.appendChild(mNumInput("₹1999", moneyView.price, function (v) { moneyView.price = v; }));
    var nl = mEl("p", "muted-line", "Is it a Need or a Want?");
    nl.style.marginTop = "10px";
    content.appendChild(nl);
    var row = mEl("div", "money-quick-actions");
    ["Need", "Want", "Not Sure"].forEach(function (label) {
      row.appendChild(mBtn(label, "preset-plan-chip" + (moneyView.needOrWant === label ? " active-chip" : ""), function () { moneyView.needOrWant = label; renderDuniyaMoney(); }));
    });
    content.appendChild(row);
    var next = mBtn("Continue", "btn btn-primary btn-full", function () {
      var name = (moneyView.itemName || "").trim();
      var price = parseFloat(moneyView.price);
      if (!name) { showToast("Enter what you want to buy"); return; }
      if (!price || price <= 0) { showToast("Enter the price"); return; }
      if (!moneyView.needOrWant) { showToast("Is it a Need or a Want?"); return; }
      goMoneyScreen("should-i-buy", { phase: "check", itemNameFinal: name, priceNum: price, needOrWant: moneyView.needOrWant, checks: {} });
    });
    next.style.marginTop = "14px";
    content.appendChild(next);
  }

  // -- Weekly report --

  function renderMoneyWeeklyReport(content) {
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });
    content.appendChild(mEl("h2", "", "This Week"));
    var last7 = getLastNDateKeys(7);
    var weekStart = last7[last7.length - 1];
    var prev7 = getLastNDateKeys(14).slice(7);
    var s = moneyStats(weekStart, null);
    content.appendChild(mRows([
      ["Money avoided", fmtRupee(s.avoided)],
      ["Money actually saved", fmtRupee(s.saved), true],
      ["Money spent", fmtRupee(s.spent)],
      ["Added to savings goals", fmtRupee(s.toGoals)]
    ]));
    content.appendChild(mEl("p", "muted-line", "Avoided isn't saved. Saved = added to a goal + kept unallocated. Spent = logged expenses + avoided money you spent elsewhere."));

    var goals = getMoneyGoals();
    if (goals.length) {
      var gh = mEl("h2", "", "Savings goals");
      gh.style.marginTop = "16px";
      content.appendChild(gh);
      goals.forEach(function (g) {
        content.appendChild(mEl("p", "", g.name + ": " + fmtRupee(g.currentSavedAmount) + " / " + fmtRupee(g.targetAmount) + " · " + goalPct(g) + "%"));
      });
    }
    var pool = unallocatedTotal();
    if (pool > 0) content.appendChild(mEl("p", "muted-line", "Unallocated savings: " + fmtRupee(pool)));

    var habits = getMoneyHabits().filter(function (h) { return !h.archived; });
    if (habits.length) {
      var logs = getMoneyDailyLogs();
      var thisSpend = 0, lastSpend = 0;
      habits.forEach(function (habit) {
        last7.forEach(function (k) { var e = logs[k] && logs[k][habit.id]; if (e) thisSpend += e.actualQuantity * habit.costPerUnit; });
        prev7.forEach(function (k) { var e = logs[k] && logs[k][habit.id]; if (e) lastSpend += e.actualQuantity * habit.costPerUnit; });
      });
      var hh = mEl("p", "muted-line", "Habit spending");
      hh.style.marginTop = "14px";
      content.appendChild(hh);
      var less = thisSpend <= lastSpend;
      var diff = less ? lastSpend - thisSpend : thisSpend - lastSpend;
      content.appendChild(mRows([
        ["Last week", fmtRupee(lastSpend)],
        ["This week", fmtRupee(thisSpend)],
        ["Difference", fmtRupee(diff) + (less ? " less spent" : " more spent"), true]
      ]));
      if (less && diff > 0) content.appendChild(mEl("p", "muted-line", "If this continued for 4 weeks: ≈ " + fmtRupee(diff * 4) + " (estimate, not guaranteed)."));
    }
    var gh2 = mEl("p", "muted-line", "Actually saved each day");
    gh2.style.marginTop = "14px";
    content.appendChild(gh2);
    content.appendChild(renderMoneyWeekGraph());
  }

  // -- Goal completed --

  function renderMoneyGoalCompleted(content) {
    var goal = getGoal(moneyView.goalId);
    if (!goal) { goMoneyScreen("dashboard"); return; }
    var box = mEl("div", "");
    box.style.textAlign = "center";
    box.appendChild(mEl("h2", "", "🎉 " + fmtRupee(goal.targetAmount) + " SAVINGS GOAL COMPLETED"));
    box.appendChild(mEl("p", "muted-line", "You reached your target for “" + goal.name + "”."));
    content.appendChild(box);
    var days = Math.max(1, Math.round((new Date(goal.completedAt) - new Date(goal.createdAt)) / 86400000));
    var fromAvoided = 0, fromHabits = 0, other = 0;
    getContribs().forEach(function (c) {
      if (c.goalId !== goal.id) return;
      if (c.source === "avoided-purchase") fromAvoided += c.amount;
      else if (c.source === "smoking" || c.source === "habit") fromHabits += c.amount;
      else other += c.amount;
    });
    var stats = mRows([
      ["Total saved", fmtRupee(goal.currentSavedAmount), true],
      ["Days taken", String(days)],
      ["From avoided purchases", fmtRupee(fromAvoided)],
      ["From reduced habits", fmtRupee(fromHabits)],
      ["Added other ways", fmtRupee(other)]
    ]);
    stats.style.marginTop = "16px";
    content.appendChild(stats);
    var nb = mBtn("Create New Goal", "btn btn-primary btn-full", function () { markGoalCelebrationSeen(goal.id); goMoneyScreen("new-goal"); });
    nb.style.marginTop = "16px";
    content.appendChild(nb);
    content.appendChild(mBtn("Continue Saving", "btn btn-outline btn-full", function () { markGoalCelebrationSeen(goal.id); goMoneyScreen("dashboard"); }));
  }

  // -- Router --

  function renderDuniyaMoney() {
    var content = document.getElementById("duniya-money-content");
    moneyMigrateV2();
    syncGoals();
    if (!moneyView) moneyView = { screen: "dashboard" };
    if (moneyView.screen === "dashboard") {
      var done = getMoneyGoals().filter(function (g) { return g.completedAt && !g.celebrationSeen; })[0];
      if (done) moneyView = { screen: "goal-completed", goalId: done.id };
    }
    content.innerHTML = "";
    var s = moneyView.screen;
    if (s === "new-goal") renderMoneyNewGoal(content);
    else if (s === "goal") renderMoneyGoal(content);
    else if (s === "add-money") renderMoneyAddMoney(content);
    else if (s === "expense") renderMoneyExpense(content);
    else if (s === "allocate") renderMoneyAllocate(content);
    else if (s === "alloc-done") renderMoneyAllocDone(content);
    else if (s === "move-unalloc") renderMoneyMoveUnalloc(content);
    else if (s === "habit-setup") renderMoneyHabitSetup(content);
    else if (s === "habit-checkin") renderMoneyHabitCheckin(content);
    else if (s === "avoided-purchase") renderMoneyAvoidedPurchase(content);
    else if (s === "should-i-buy") renderMoneyShouldIBuy(content);
    else if (s === "weekly-report") renderMoneyWeeklyReport(content);
    else if (s === "goal-completed") renderMoneyGoalCompleted(content);
    else renderMoneyDashboard(content);
  }

  function initDuniyaMoney() {
    document.getElementById("duniya-money-back").addEventListener("click", function () {
      moneyView = { screen: "dashboard" };
      setActiveView("duniya");
    });
  }

  // ---- Phone Control → Intentional Open (Android app only) ----
  // The website cannot see other apps. Everything real here is done by the
  // native NURA Android app through window.NuraNative; without it this screen
  // says so plainly instead of pretending. All numbers shown come from data the
  // phone stored locally — nothing is estimated or invented.

  var pgView = { screen: "main" };
  var pgAppsCache = null;
  var pgAppFilter = "";

  function pgNative() { return window.NuraNative || null; }
  function pgParse(fn, fallback) {
    try { return JSON.parse(fn()); } catch (e) { return fallback; }
  }
  function pgStatus() { var n = pgNative(); return n ? pgParse(function () { return n.getStatus(); }, null) : null; }
  function pgConfig() {
    var n = pgNative();
    var c = n ? pgParse(function () { return n.getConfig(); }, null) : null;
    if (!c) c = { enabled: false, repeatCount: 3, repeatWindowMin: 15, graceMin: 10, pauseFreshOpen: true, apps: {} };
    if (!c.apps) c.apps = {};
    return c;
  }
  function pgSave(cfg) { var n = pgNative(); return n ? !!n.setConfig(JSON.stringify(cfg)) : false; }
  function pgStats() { var n = pgNative(); return n ? pgParse(function () { return n.getAllStats(); }, {}) : {}; }

  function pgFmtDur(ms) {
    var m = Math.round(ms / 60000);
    if (ms > 0 && m < 1) return "<1m";
    var h = Math.floor(m / 60);
    return h > 0 ? h + "h " + (m % 60) + "m" : m + "m";
  }

  function pgEl(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function pgBtn(label, cls, fn) {
    var b = pgEl("button", cls, label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }
  function pgStepper(value, min, max, step, fmt, onChange) {
    var wrap = pgEl("div", "money-quantity-stepper");
    var minus = pgBtn("−", "", function () { onChange(Math.max(min, value - step)); });
    var val = pgEl("span", "value", fmt(value));
    val.style.minWidth = "90px";
    var plus = pgBtn("+", "", function () { onChange(Math.min(max, value + step)); });
    wrap.appendChild(minus); wrap.appendChild(val); wrap.appendChild(plus);
    return wrap;
  }
  function pgBack(content, fn) { content.appendChild(pgBtn("← Back", "picker-step-back", fn)); }

  function pgSummarize(stats, keys) {
    var out = { ms: 0, opens: 0, pauses: 0, wentBack: 0, continued: 0, appOpens: {}, hasData: false };
    keys.forEach(function (k) {
      var d = stats[k];
      if (!d) return;
      out.hasData = true;
      out.pauses += d.pauses || 0;
      out.wentBack += d.wentBack || 0;
      out.continued += d.continued || 0;
      var apps = d.apps || {};
      Object.keys(apps).forEach(function (pkg) {
        out.ms += apps[pkg].ms || 0;
        out.opens += apps[pkg].opens || 0;
        out.appOpens[pkg] = (out.appOpens[pkg] || 0) + (apps[pkg].opens || 0);
      });
    });
    return out;
  }

  function renderPhoneGuard() {
    var content = document.getElementById("duniya-phone-guard-content");
    if (!content) return;
    content.innerHTML = "";
    if (pgView.screen === "perms") return renderPgPerms(content);
    if (pgView.screen === "apps") return renderPgApps(content);
    if (pgView.screen === "appedit") return renderPgAppEdit(content);
    if (pgView.screen === "rules") return renderPgRules(content);
    renderPgMain(content);
  }

  function renderPgMain(content) {
    content.appendChild(pgEl("p", "muted-line", "Pause before distracting apps pull you in."));

    if (!pgNative()) {
      var box = pgEl("div", "money-wait-banner");
      box.style.marginTop = "14px";
      box.appendChild(pgEl("p", "", "Intentional Open needs the NURA Android app."));
      box.lastChild.style.margin = "0 0 6px";
      box.appendChild(pgEl("p", "muted-line", "A web page can't see which apps you open, so nothing here can work in a browser. The manual pause steps under Phone Control still work everywhere."));
      content.appendChild(box);
      return;
    }

    var st = pgStatus() || {};
    var cfg = pgConfig();
    var pkgs = Object.keys(cfg.apps);

    // ---- problems, never silent ----
    function problem(msg, btnLabel, fn) {
      var b = pgEl("div", "plan-conflict-banner", msg);
      b.style.marginTop = "12px";
      if (btnLabel) {
        var row = pgEl("div", "");
        row.style.marginTop = "8px";
        row.appendChild(pgBtn(btnLabel, "action-btn primary", fn));
        b.appendChild(row);
      }
      content.appendChild(b);
    }
    if (cfg.enabled) {
      if (!st.usageAccess) problem("Usage Access was turned off, so NURA can't see your selected apps. Monitoring is stopped.", "Open Usage Access settings", function () { pgNative().openUsageAccessSettings(); });
      else if (!st.overlay) problem("“Display over other apps” is off, so the pause screen can't appear.", "Open the setting", function () { pgNative().openOverlaySettings(); });
      else if (!st.serviceRunning) problem("Monitoring isn't running right now. Android may have stopped it.", "Restart monitoring", function () { pgNative().restartMonitor(); setTimeout(renderPhoneGuard, 1500); });
      (st.missing || []).forEach(function (pkg) {
        var label = cfg.apps[pkg] ? cfg.apps[pkg].label : pkg;
        problem(label + " is no longer installed.", "Remove from list", function () { delete cfg.apps[pkg]; pgSave(cfg); renderPhoneGuard(); });
      });
      if (st.usageAccess && st.overlay && !st.batteryUnrestricted) {
        var hint = pgEl("div", "money-wait-banner");
        hint.style.marginTop = "12px";
        hint.appendChild(pgEl("p", "", "Battery saving may stop monitoring on some phones."));
        hint.lastChild.style.margin = "0 0 8px";
        hint.appendChild(pgBtn("Open battery settings", "action-btn", function () { pgNative().openBatterySettings(); }));
        content.appendChild(hint);
      }
      if (!st.notifications && pkgs.some(function (p) { return cfg.apps[p].dailyTargetMin > 0 || cfg.apps[p].sessionMin > 0; })) {
        problem("Notifications are off, so you won't get reminders when a limit you set is reached.", "Allow notifications", function () { pgNative().requestNotifications(); });
      }
    }

    // ---- on / off ----
    var head = pgEl("div", "");
    head.style.margin = "16px 0";
    head.appendChild(pgEl("h2", "", cfg.enabled ? "Intentional Open is ON" : "Intentional Open is OFF"));
    if (!cfg.enabled) {
      head.appendChild(pgEl("p", "muted-line", "NURA can detect when selected apps are opened so it can give you a short pause before you continue."));
    } else {
      head.appendChild(pgEl("p", "muted-line", "Only the " + pkgs.length + " app" + (pkgs.length === 1 ? "" : "s") + " you selected are watched. Turning this off stops everything."));
    }
    var toggle = pgBtn(cfg.enabled ? "Turn off" : "Turn on", cfg.enabled ? "btn btn-outline btn-full" : "btn btn-primary btn-full", function () {
      if (cfg.enabled) { cfg.enabled = false; pgSave(cfg); renderPhoneGuard(); return; }
      var s = pgStatus() || {};
      if (!s.usageAccess || !s.overlay || !pkgs.length) { pgView = { screen: "perms" }; renderPhoneGuard(); return; }
      cfg.enabled = true;
      if (!pgSave(cfg)) showToast("Couldn't start monitoring");
      setTimeout(renderPhoneGuard, 800);
    });
    toggle.style.marginTop = "10px";
    head.appendChild(toggle);
    content.appendChild(head);

    // ---- today ----
    var stats = pgStats();
    var today = pgSummarize(stats, [todayKey()]);
    content.appendChild(pgEl("h2", "", "Today"));
    var mostPkg = null;
    Object.keys(today.appOpens).forEach(function (p) { if (today.appOpens[p] > 0 && (!mostPkg || today.appOpens[p] > today.appOpens[mostPkg])) mostPkg = p; });
    var mostLabel = mostPkg ? ((cfg.apps[mostPkg] && cfg.apps[mostPkg].label) || mostPkg) + " (" + today.appOpens[mostPkg] + ")" : "—";
    function tiles(rows) {
      var g = pgEl("div", "money-stat-grid");
      rows.forEach(function (r) {
        var t = pgEl("div", "money-stat-tile");
        t.appendChild(pgEl("span", "big", r[1]));
        t.appendChild(pgEl("span", "lbl", r[0]));
        g.appendChild(t);
      });
      content.appendChild(g);
    }
    tiles([["Social media time", pgFmtDur(today.ms)], ["Intentional pauses", String(today.pauses)], ["Went back", String(today.wentBack)]]);
    tiles([["Chose Continue", String(today.continued)], ["Openings", String(today.opens)], ["Most opened", mostLabel]]);

    // ---- apps ----
    content.appendChild(pgEl("h2", "", "Apps NURA watches"));
    if (!pkgs.length) content.appendChild(pgEl("p", "muted-line", "No apps chosen yet."));
    pkgs.forEach(function (pkg) {
      var a = cfg.apps[pkg];
      var card = pgEl("div", "money-habit-card");
      card.appendChild(pgEl("p", "name", a.label));
      var bits = [];
      bits.push(a.dailyTargetMin > 0 ? "Daily target " + a.dailyTargetMin + " min" : "No daily target");
      if (a.openLimit > 0) bits.push("max " + a.openLimit + " opens");
      if (a.sessionMin > 0) bits.push(a.sessionMin + " min sessions");
      card.appendChild(pgEl("p", "cost-line", bits.join(" · ")));
      var row = pgEl("div", "money-quick-actions");
      row.appendChild(pgBtn("Limits", "action-btn", function () { pgView = { screen: "appedit", pkg: pkg }; renderPhoneGuard(); }));
      row.appendChild(pgBtn("Remove", "action-btn", function () { delete cfg.apps[pkg]; pgSave(cfg); renderPhoneGuard(); }));
      card.appendChild(row);
      content.appendChild(card);
    });
    content.appendChild(pgBtn(pkgs.length ? "Change apps" : "Choose apps to watch", "btn btn-outline btn-full", function () { pgView = { screen: "apps" }; renderPhoneGuard(); }));

    // ---- rules ----
    content.appendChild(pgEl("h2", "", "Pause rules")).style.marginTop = "18px";
    content.appendChild(pgEl("p", "muted-line", (cfg.pauseFreshOpen ? "Pause on a fresh open. " : "Pause only on repeated opens. ") + "Pause again if an app is opened " + cfg.repeatCount + " times in " + cfg.repeatWindowMin + " min. After you continue, it won't ask again for " + cfg.graceMin + " min."));
    var rulesBtn = pgBtn("Adjust rules", "priority-change-link", function () { pgView = { screen: "rules" }; renderPhoneGuard(); });
    content.appendChild(rulesBtn);

    // ---- this week vs last ----
    content.appendChild(pgEl("h2", "", "This week")).style.marginTop = "18px";
    var wk = pgSummarize(stats, getLastNDateKeys(7));
    var prev = pgSummarize(stats, getLastNDateKeys(14).slice(7));
    if (!wk.hasData && !prev.hasData) {
      content.appendChild(pgEl("p", "muted-line", "No data yet. It appears here after Intentional Open has been on for a day."));
    } else {
      var box2 = pgEl("div", "money-cost-breakdown");
      function line(label, value, hl) {
        var r = pgEl("div", "row" + (hl ? " highlight" : ""));
        r.appendChild(pgEl("span", "", label));
        r.appendChild(pgEl("span", "", value));
        box2.appendChild(r);
      }
      line("Last week", prev.hasData ? pgFmtDur(prev.ms) : "no data");
      line("This week", pgFmtDur(wk.ms));
      if (prev.hasData) {
        var diff = wk.ms - prev.ms;
        line("Change", diff === 0 ? "No change" : (diff < 0 ? "↓ " : "↑ ") + pgFmtDur(Math.abs(diff)), true);
      }
      line("Average per day", pgFmtDur(wk.ms / 7));
      line("Openings", String(wk.opens));
      line("Intentional pauses", String(wk.pauses));
      line("Went back", String(wk.wentBack));
      content.appendChild(box2);
    }

    var done = pgEl("p", "muted-line", "You're done for now. Put the phone away.");
    done.style.marginTop = "22px";
    done.style.textAlign = "center";
    content.appendChild(done);
  }

  function renderPgPerms(content) {
    pgBack(content, function () { pgView = { screen: "main" }; renderPhoneGuard(); });
    content.appendChild(pgEl("h2", "", "Before you turn this on"));
    content.appendChild(pgEl("p", "muted-line", "NURA can detect when selected apps are opened so it can give you a short pause before you continue. It only sees which app is in front — never what is inside it. Everything stays on this phone."));

    var st = pgStatus() || {};
    var cfg = pgConfig();
    var n = pgNative();

    function item(title, status, why, btnLabel, fn, required) {
      var card = pgEl("div", "money-habit-card");
      card.style.marginTop = "12px";
      card.appendChild(pgEl("p", "name", (status ? "✓ " : "") + title + (required ? "" : " (optional)")));
      card.appendChild(pgEl("p", "cost-line", why));
      if (!status) {
        var row = pgEl("div", "money-quick-actions");
        row.appendChild(pgBtn(btnLabel, "action-btn primary", fn));
        card.appendChild(row);
      }
      content.appendChild(card);
    }
    item("Usage Access", st.usageAccess,
      "Needed so NURA can tell when one of your chosen apps comes to the front. Android will open a Settings list: find NURA, switch it on, then come back.",
      "Enable Required Permission", function () { n.openUsageAccessSettings(); }, true);
    item("Display over other apps", st.overlay,
      "Needed so the short pause screen can appear on top of the app you're opening. Android will open Settings: switch it on for NURA, then come back.",
      "Enable Required Permission", function () { n.openOverlaySettings(); }, true);
    item("Notifications", st.notifications,
      "Only used to tell you when a time limit you set is reached, and to show that monitoring is on. Never “come back” messages.",
      "Allow notifications", function () { n.requestNotifications(); }, false);
    item("Run in the background", st.batteryUnrestricted,
      "Some phones, including Vivo, stop background apps to save battery. Allowing NURA keeps the pause reliable.",
      "Open battery settings", function () { n.openBatterySettings(); }, false);

    var pkgs = Object.keys(cfg.apps);
    var appsCard = pgEl("div", "money-habit-card");
    appsCard.style.marginTop = "12px";
    appsCard.appendChild(pgEl("p", "name", (pkgs.length ? "✓ " : "") + "Apps to watch"));
    appsCard.appendChild(pgEl("p", "cost-line", pkgs.length ? pkgs.length + " selected. NURA watches only these." : "Choose the apps you want a pause for. You decide the list."));
    var arow = pgEl("div", "money-quick-actions");
    arow.appendChild(pgBtn(pkgs.length ? "Change apps" : "Choose apps", "action-btn primary", function () { pgView = { screen: "apps" }; renderPhoneGuard(); }));
    appsCard.appendChild(arow);
    content.appendChild(appsCard);

    var ready = st.usageAccess && st.overlay && pkgs.length > 0;
    var go = pgBtn("Turn on Intentional Open", "btn btn-primary btn-full", function () {
      if (!ready) return;
      cfg.enabled = true;
      if (!pgSave(cfg)) { showToast("Couldn't start monitoring"); return; }
      pgView = { screen: "main" };
      setTimeout(renderPhoneGuard, 800);
    });
    go.style.marginTop = "16px";
    if (!ready) { go.disabled = true; go.style.opacity = "0.5"; }
    content.appendChild(go);
    if (!ready) content.appendChild(pgEl("p", "muted-line", "Turn on the two required permissions and choose at least one app.")).style.marginTop = "8px";
  }

  function renderPgApps(content) {
    pgBack(content, function () { pgView = { screen: "main" }; renderPhoneGuard(); });
    content.appendChild(pgEl("h2", "", "Choose apps to watch"));
    var cfg = pgConfig();
    if (!pgAppsCache) pgAppsCache = pgParse(function () { return pgNative().listApps(); }, []);
    var search = pgEl("input", "text-input");
    search.type = "text";
    search.placeholder = "Search apps";
    search.value = pgAppFilter;
    content.appendChild(search);
    var list = pgEl("div", "");
    content.appendChild(list);

    function drawList() {
      list.innerHTML = "";
      var q = pgAppFilter.trim().toLowerCase();
      var rows = pgAppsCache.filter(function (a) { return !q || a.label.toLowerCase().indexOf(q) !== -1; });
      rows.sort(function (a, b) {
        var sa = cfg.apps[a.pkg] ? 0 : 1, sb = cfg.apps[b.pkg] ? 0 : 1;
        return sa - sb || a.label.toLowerCase().localeCompare(b.label.toLowerCase());
      });
      if (!rows.length) list.appendChild(pgEl("p", "muted-line", "No apps found."));
      rows.forEach(function (a) {
        var label = pgEl("label", "money-checkbox-row");
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!cfg.apps[a.pkg];
        cb.addEventListener("change", function () {
          if (cb.checked) cfg.apps[a.pkg] = { label: a.label, dailyTargetMin: 0, openLimit: 0, sessionMin: 0 };
          else delete cfg.apps[a.pkg];
          pgSave(cfg);
        });
        label.appendChild(cb);
        label.appendChild(pgEl("span", "", a.label));
        list.appendChild(label);
      });
    }
    search.addEventListener("input", function () { pgAppFilter = search.value; drawList(); });
    drawList();
    var done = pgBtn("Done", "btn btn-primary btn-full", function () { pgView = { screen: "main" }; renderPhoneGuard(); });
    done.style.marginTop = "14px";
    content.appendChild(done);
  }

  function renderPgAppEdit(content) {
    var cfg = pgConfig();
    var a = cfg.apps[pgView.pkg];
    if (!a) { pgView = { screen: "main" }; return renderPhoneGuard(); }
    pgBack(content, function () { pgView = { screen: "main" }; renderPhoneGuard(); });
    content.appendChild(pgEl("h2", "", a.label));
    function setField(k, v) { a[k] = v; pgSave(cfg); renderPhoneGuard(); }
    content.appendChild(pgEl("p", "muted-line", "Daily target (minutes a day)"));
    content.appendChild(pgStepper(a.dailyTargetMin, 0, 600, 5, function (v) { return v === 0 ? "None" : v + " min"; }, function (v) { setField("dailyTargetMin", v); }));
    content.appendChild(pgEl("p", "muted-line", "Opening limit (opens a day)"));
    content.appendChild(pgStepper(a.openLimit, 0, 100, 1, function (v) { return v === 0 ? "None" : String(v); }, function (v) { setField("openLimit", v); }));
    content.appendChild(pgEl("p", "muted-line", "Session timer (minutes each visit)"));
    content.appendChild(pgStepper(a.sessionMin, 0, 120, 5, function (v) { return v === 0 ? "None" : v + " min"; }, function (v) { setField("sessionMin", v); }));
    content.appendChild(pgEl("p", "muted-line", "These are your own limits — NURA doesn't set any for you. Reaching one sends a single reminder.")).style.marginTop = "8px";
  }

  function renderPgRules(content) {
    var cfg = pgConfig();
    pgBack(content, function () { pgView = { screen: "main" }; renderPhoneGuard(); });
    content.appendChild(pgEl("h2", "", "Pause rules"));
    function setField(k, v) { cfg[k] = v; pgSave(cfg); renderPhoneGuard(); }
    content.appendChild(pgEl("p", "muted-line", "Pause again after this many opens…"));
    content.appendChild(pgStepper(cfg.repeatCount, 2, 10, 1, function (v) { return v + " opens"; }, function (v) { setField("repeatCount", v); }));
    content.appendChild(pgEl("p", "muted-line", "…within this many minutes"));
    content.appendChild(pgStepper(cfg.repeatWindowMin, 5, 120, 5, function (v) { return v + " min"; }, function (v) { setField("repeatWindowMin", v); }));
    content.appendChild(pgEl("p", "muted-line", "After I continue, don't ask again for"));
    content.appendChild(pgStepper(cfg.graceMin, 5, 120, 5, function (v) { return v + " min"; }, function (v) { setField("graceMin", v); }));
    var row = pgEl("div", "money-quick-actions");
    row.appendChild(pgBtn("Pause on every fresh open", "preset-plan-chip" + (cfg.pauseFreshOpen ? " active-chip" : ""), function () { setField("pauseFreshOpen", true); }));
    row.appendChild(pgBtn("Only on repeated opens", "preset-plan-chip" + (!cfg.pauseFreshOpen ? " active-chip" : ""), function () { setField("pauseFreshOpen", false); }));
    content.appendChild(row);
  }

  function initPhoneGuard() {
    document.getElementById("duniya-phone-guard-back").addEventListener("click", function () {
      pgView = { screen: "main" };
      pickerStep = { view: "phone-distraction", bodyPart: null };
      setActiveView("duniya-tool");
    });
    window.nuraNativeResumed = function () {
      var v = document.getElementById("view-duniya-phone-guard");
      if (v && !v.classList.contains("hidden")) renderPhoneGuard();
    };
    window.nuraAndroidBack = function () {
      var vis = document.querySelector(".view:not(.hidden)");
      var name = vis ? vis.dataset.view : "home";
      if (name === "duniya-phone-guard" && pgView.screen !== "main") { pgView = { screen: "main" }; renderPhoneGuard(); return true; }
      if (name === "duniya-recovery" && rcView.screen !== "main") { rcStopTimer(); rcView = { screen: "main" }; renderRecovery(); return true; }
      if (name === "home") return false;
      setActiveView(name === "duniya-phone-guard" ? "duniya" : name === "duniya-recovery" ? "duniya-habits" : "home");
      return true;
    };
  }

  // ---- Recovery (Habits & Discipline → Recovery) ----
  // Private, local-only. A day counts as successful only when the user checks in
  // "clean" for it; a missed check-in is neither a success nor a slip. A slip ends
  // the current streak but never touches best streak, total days or history.
  // No notifications are sent by this module. Nothing here appears on Home
  // except neutral totals (no habit names) in Progress Details.

  var RC_HABITS = [
    { key: "porn", label: "Pornography" },
    { key: "masturbation", label: "Masturbation" },
    { key: "smoking", label: "Smoking" },
    { key: "cannabis", label: "Cannabis" },
    { key: "social", label: "Excessive social media" },
    { key: "gaming", label: "Gaming" },
    { key: "junkfood", label: "Junk food" },
    { key: "other", label: "Other — custom habit" }
  ];
  var RC_TRIGGERS = ["Stress", "Boredom", "Being alone", "Social media", "Late night", "Anger", "Other"];
  var RC_URGE_ACTIONS = [
    "Leave the room you're in",
    "Put your phone away, out of reach",
    "Take a short walk",
    "Drink a glass of water",
    "Make wudu, if that suits you",
    "Splash cold water on your face",
    "Do 20 push-ups or a short stretch"
  ];

  var rcView = { screen: "main" };
  var rcTimerId = null;

  function rcEl(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function rcBtn(label, cls, fn) {
    var b = rcEl("button", cls, label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }
  function rcAddDays(key, n) {
    var d = new Date(key + "T12:00:00");
    d.setDate(d.getDate() + n);
    return todayKey(d);
  }
  function rcFmtDate(key) {
    return new Date(key + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function rcHabitLabel(key) {
    var h = RC_HABITS.filter(function (x) { return x.key === key; })[0];
    return h ? h.label : key;
  }
  function rcName(j) {
    return j.nickname || (j.habit === "other" ? (j.customHabit || "Custom habit") : rcHabitLabel(j.habit));
  }

  function rcJourneys() { return readJSON("nc_recovery_journeys", []); }
  function rcSaveJourneys(a) { writeJSON("nc_recovery_journeys", a); }
  function rcLogsAll() { return readJSON("nc_recovery_logs", {}); }
  function rcSetLog(journeyId, dateKey, entry) {
    var all = rcLogsAll();
    if (!all[journeyId]) all[journeyId] = {};
    all[journeyId][dateKey] = entry;
    writeJSON("nc_recovery_logs", all);
  }
  function rcUrges() { return readJSON("nc_recovery_urges", []); }
  function rcContact() { return readJSON("nc_recovery_contact", null); }

  function rcSpan(logs, keys, startDate) {
    var c = 0, s = 0;
    keys.forEach(function (k) {
      if (k < startDate) return;
      var e = logs[k];
      if (e && e.status === "clean") c++;
      else if (e && e.status === "slip") s++;
    });
    return { clean: c, slips: s };
  }

  function rcCompute(j) {
    var logs = rcLogsAll()[j.id] || {};
    var today = todayKey();
    var out = { clean: 0, slips: 0, best: 0, current: 0, started: j.startDate <= today, logs: logs };
    if (out.started) {
      var run = 0, d = j.startDate, guard = 0;
      while (d <= today && guard < 5000) {
        var e = logs[d];
        if (e && e.status === "clean") { out.clean++; run++; if (run > out.best) out.best = run; }
        else { if (e && e.status === "slip") out.slips++; run = 0; }
        d = rcAddDays(d, 1);
        guard++;
      }
      var k = today;
      if (!logs[k]) k = rcAddDays(k, -1);
      while (k >= j.startDate && logs[k] && logs[k].status === "clean") { out.current++; k = rcAddDays(k, -1); }
    }
    var last7 = getLastNDateKeys(7);
    out.weekDays = last7.slice().reverse().map(function (key) {
      return { key: key, status: key >= j.startDate && logs[key] ? logs[key].status : null };
    });
    out.week = rcSpan(logs, last7, j.startDate);
    out.prev = rcSpan(logs, getLastNDateKeys(14).slice(7), j.startDate);
    return out;
  }

  function rcMoney(j, stats) {
    if (j.habit !== "smoking" || !j.cigsPerDay || !j.costPerCig) return null;
    var perDay = j.cigsPerDay * j.costPerCig;
    return {
      perDay: perDay,
      cigsAvoided: stats.clean * j.cigsPerDay,
      total: stats.clean * perDay,
      week: stats.week.clean * perDay
    };
  }

  function rcTriggerCounts(logs, fromKey) {
    var counts = {}, slips = 0;
    Object.keys(logs).forEach(function (k) {
      var e = logs[k];
      if (e.status !== "slip" || (fromKey && k < fromKey)) return;
      slips++;
      var t = e.trigger || "Not recorded";
      counts[t] = (counts[t] || 0) + 1;
    });
    return { counts: counts, slips: slips };
  }
  function rcTopTrigger(tc) {
    var top = null;
    Object.keys(tc.counts).forEach(function (t) {
      if (t !== "Not recorded" && (!top || tc.counts[t] > tc.counts[top])) top = t;
    });
    return top ? top + " (" + tc.counts[top] + " of " + tc.slips + " slips)" : null;
  }

  function rcStopTimer() { if (rcTimerId) { clearInterval(rcTimerId); rcTimerId = null; } }
  function rcGo(screen, extra) {
    var v = extra || {};
    v.screen = screen;
    rcView = v;
    renderRecovery();
  }

  function renderRecovery() {
    var content = document.getElementById("duniya-recovery-content");
    if (!content) return;
    if (rcView.screen !== "urge") rcStopTimer();
    content.innerHTML = "";
    if (rcView.screen === "start") return renderRcStart(content);
    if (rcView.screen === "dash") return renderRcDash(content);
    if (rcView.screen === "slip") return renderRcSlip(content);
    if (rcView.screen === "urge") return renderRcUrge(content);
    renderRcMain(content);
  }

  function rcBack(content, fn) { content.appendChild(rcBtn("← Back", "picker-step-back", fn)); }

  function renderRcMain(content) {
    var privacy = rcEl("p", "muted-line", "Private to this device. Nothing here shows on your Home screen.");
    content.appendChild(privacy);

    var urge = rcBtn("I'm having an urge", "btn btn-primary btn-full", function () { startRcUrge(null); });
    urge.style.marginTop = "14px";
    content.appendChild(urge);

    var journeys = rcJourneys();
    if (!journeys.length) {
      content.appendChild(rcEl("h2", "", "Quit or control a habit")).style.marginTop = "16px";
      content.appendChild(rcEl("p", "muted-line", "Choose what you want to change. NURA keeps your progress, remembers what triggers you, and helps you restart without shame."));
    } else {
      content.appendChild(rcEl("h2", "", "Your recovery")).style.marginTop = "16px";
      var today = todayKey();
      journeys.forEach(function (j) {
        var s = rcCompute(j);
        var card = rcEl("div", "money-habit-card");
        card.appendChild(rcEl("p", "name", rcName(j) + " Recovery"));
        var e = s.logs[today];
        var line = !s.started ? "Starts " + rcFmtDate(j.startDate)
          : "Current streak: " + s.current + " day" + (s.current === 1 ? "" : "s") + " · Today: " + (e ? (e.status === "clean" ? "clean" : "slipped") : "not checked in");
        card.appendChild(rcEl("p", "cost-line", line));
        var row = rcEl("div", "money-quick-actions");
        row.appendChild(rcBtn("Open", "action-btn primary", function () { rcGo("dash", { id: j.id }); }));
        card.appendChild(row);
        content.appendChild(card);
      });
    }
    var startBtn = rcBtn(journeys.length ? "+ Start another recovery" : "Start Recovery", journeys.length ? "btn btn-outline btn-full" : "btn btn-primary btn-full", function () {
      rcGo("start", { step: 1, data: { habit: null, customHabit: "", nickname: "", startChoice: "today", startDate: todayKey(), why: "", triggers: [], triggerNote: "", goal: "", cigsPerDay: 10, costMode: "cig", cost: "", packSize: 20, savingGoal: "" } });
    });
    startBtn.style.marginTop = "12px";
    content.appendChild(startBtn);
  }

  // ---- Start Recovery wizard ----

  function renderRcStart(content) {
    var d = rcView.data, step = rcView.step;
    var isSmoking = d.habit === "smoking";
    var total = isSmoking ? 6 : 5;
    rcBack(content, function () { if (step > 1) { rcView.step = step - 1; renderRecovery(); } else rcGo("main"); });
    content.appendChild(rcEl("p", "muted-line", "Step " + step + " of " + total));
    function next() { rcView.step = step + 1; renderRecovery(); }
    function nextBtn(label, fn) {
      var b = rcBtn(label || "Next", "btn btn-primary btn-full", fn || next);
      b.style.marginTop = "14px";
      content.appendChild(b);
    }

    if (step === 1) {
      content.appendChild(rcEl("h2", "", "What do you want to quit or control?"));
      var chips = rcEl("div", "money-quick-actions");
      RC_HABITS.forEach(function (h) {
        chips.appendChild(rcBtn(h.label, "preset-plan-chip" + (d.habit === h.key ? " active-chip" : ""), function () { d.habit = h.key; renderRecovery(); }));
      });
      content.appendChild(chips);
      if (d.habit === "other") {
        var custom = rcEl("input", "text-input");
        custom.type = "text"; custom.placeholder = "Name this habit"; custom.value = d.customHabit;
        custom.addEventListener("input", function () { d.customHabit = custom.value; });
        content.appendChild(custom);
      }
      content.appendChild(rcEl("p", "muted-line", "Private name (optional) — shown instead of the habit name")).style.marginTop = "12px";
      var nick = rcEl("input", "text-input");
      nick.type = "text"; nick.placeholder = "e.g. My challenge"; nick.value = d.nickname;
      nick.addEventListener("input", function () { d.nickname = nick.value; });
      content.appendChild(nick);
      nextBtn("Next", function () {
        if (!d.habit) { showToast("Choose one to continue"); return; }
        if (d.habit === "other" && !d.customHabit.trim()) { showToast("Name this habit"); return; }
        next();
      });
    } else if (step === 2) {
      content.appendChild(rcEl("h2", "", "When do you want to start?"));
      var row = rcEl("div", "money-quick-actions");
      row.appendChild(rcBtn("Today", "preset-plan-chip" + (d.startChoice === "today" ? " active-chip" : ""), function () { d.startChoice = "today"; d.startDate = todayKey(); renderRecovery(); }));
      row.appendChild(rcBtn("Tomorrow", "preset-plan-chip" + (d.startChoice === "tomorrow" ? " active-chip" : ""), function () { d.startChoice = "tomorrow"; d.startDate = rcAddDays(todayKey(), 1); renderRecovery(); }));
      row.appendChild(rcBtn("Pick a date", "preset-plan-chip" + (d.startChoice === "date" ? " active-chip" : ""), function () { d.startChoice = "date"; renderRecovery(); }));
      content.appendChild(row);
      if (d.startChoice === "date") {
        var di = rcEl("input", "text-input");
        di.type = "date"; di.min = todayKey(); di.value = d.startDate;
        di.addEventListener("change", function () { if (di.value) d.startDate = di.value; });
        content.appendChild(di);
      }
      content.appendChild(rcEl("p", "muted-line", "Starts " + rcFmtDate(d.startDate) + ".")).style.marginTop = "8px";
      nextBtn();
    } else if (step === 3) {
      content.appendChild(rcEl("h2", "", "Why do you want to quit?"));
      var why = rcEl("textarea", "text-input rec-textarea");
      why.placeholder = "In your own words. Only you will see this."; why.value = d.why;
      why.addEventListener("input", function () { d.why = why.value; });
      content.appendChild(why);
      nextBtn();
    } else if (step === 4) {
      content.appendChild(rcEl("h2", "", "What normally triggers you?"));
      var tchips = rcEl("div", "money-quick-actions");
      RC_TRIGGERS.forEach(function (t) {
        var on = d.triggers.indexOf(t) !== -1;
        tchips.appendChild(rcBtn(t, "preset-plan-chip" + (on ? " active-chip" : ""), function () {
          if (on) d.triggers.splice(d.triggers.indexOf(t), 1); else d.triggers.push(t);
          renderRecovery();
        }));
      });
      content.appendChild(tchips);
      var tn = rcEl("input", "text-input");
      tn.type = "text"; tn.placeholder = "Anything else? (optional)"; tn.value = d.triggerNote;
      tn.addEventListener("input", function () { d.triggerNote = tn.value; });
      content.appendChild(tn);
      nextBtn();
    } else if (step === 5) {
      content.appendChild(rcEl("h2", "", "A personal goal (optional)"));
      var goal = rcEl("input", "text-input");
      goal.type = "text"; goal.placeholder = "e.g. Feel calmer, be present with family"; goal.value = d.goal;
      goal.addEventListener("input", function () { d.goal = goal.value; });
      content.appendChild(goal);
      nextBtn(isSmoking ? "Next" : "Start my recovery", isSmoking ? next : function () { finishRcStart(); });
    } else if (step === 6) {
      content.appendChild(rcEl("h2", "", "About your smoking"));
      content.appendChild(rcEl("p", "muted-line", "Cigarettes per day"));
      content.appendChild(buildMoneyStepper(d.cigsPerDay, function (v) { d.cigsPerDay = v; renderRecovery(); }, 1, 100));
      var mode = rcEl("div", "money-quick-actions");
      mode.appendChild(rcBtn("Cost per cigarette", "preset-plan-chip" + (d.costMode === "cig" ? " active-chip" : ""), function () { d.costMode = "cig"; renderRecovery(); }));
      mode.appendChild(rcBtn("Cost per pack", "preset-plan-chip" + (d.costMode === "pack" ? " active-chip" : ""), function () { d.costMode = "pack"; renderRecovery(); }));
      content.appendChild(mode);
      var preview = rcEl("div", "");
      function drawPreview() {
        preview.innerHTML = "";
        var c = rcResolveCost(d);
        if (c) preview.appendChild(rcEl("p", "muted-line", "≈ " + fmtRupee(c * d.cigsPerDay) + " a day · " + fmtRupee(c * d.cigsPerDay * 7) + " a week"));
      }
      var cost = rcEl("input", "text-input");
      cost.type = "number"; cost.min = "0"; cost.placeholder = d.costMode === "cig" ? "₹ per cigarette" : "₹ per pack"; cost.value = d.cost;
      cost.addEventListener("input", function () { d.cost = cost.value; drawPreview(); });
      content.appendChild(cost);
      if (d.costMode === "pack") {
        content.appendChild(rcEl("p", "muted-line", "Cigarettes in a pack"));
        content.appendChild(buildMoneyStepper(d.packSize, function (v) { d.packSize = v; renderRecovery(); }, 1, 50));
      }
      content.appendChild(preview);
      drawPreview();
      content.appendChild(rcEl("p", "muted-line", "Saving goal (optional)")).style.marginTop = "12px";
      var sg = rcEl("input", "text-input");
      sg.type = "number"; sg.min = "0"; sg.placeholder = "₹5000"; sg.value = d.savingGoal;
      sg.addEventListener("input", function () { d.savingGoal = sg.value; });
      content.appendChild(sg);
      nextBtn("Start my recovery", function () {
        if (!rcResolveCost(d)) { showToast("Enter what a cigarette or pack costs"); return; }
        finishRcStart();
      });
    }
  }

  function rcResolveCost(d) {
    var c = parseFloat(d.cost);
    if (!c || c <= 0) return 0;
    return d.costMode === "pack" ? c / Math.max(1, d.packSize) : c;
  }

  function finishRcStart() {
    var d = rcView.data;
    var j = {
      id: uid("rec"), habit: d.habit, customHabit: d.customHabit.trim(), nickname: d.nickname.trim(),
      startDate: d.startDate, why: d.why.trim(), triggers: d.triggers.slice(), triggerNote: d.triggerNote.trim(),
      goal: d.goal.trim(), createdAt: new Date().toISOString()
    };
    if (d.habit === "smoking") {
      j.cigsPerDay = d.cigsPerDay;
      j.costPerCig = rcResolveCost(d);
      j.savingGoal = parseFloat(d.savingGoal) > 0 ? parseFloat(d.savingGoal) : 0;
    }
    var list = rcJourneys();
    list.push(j);
    rcSaveJourneys(list);
    showToast("Your recovery has started");
    rcGo("dash", { id: j.id });
  }

  // ---- Dashboard ----

  function rcCheckinBlock(content, j, dateKey, heading) {
    var s = rcCompute(j);
    var e = s.logs[dateKey];
    var wrap = rcEl("div", "");
    wrap.appendChild(rcEl("p", "muted-line", heading));
    function record(status) {
      rcSetLog(j.id, dateKey, { status: status, trigger: null, at: new Date().toISOString() });
      if (status === "slip") rcGo("slip", { id: j.id, dateKey: dateKey });
      else { showToast("Saved"); rcGo("dash", { id: j.id }); }
    }
    if (e && !rcView.changing) {
      var t = rcEl("p", "", e.status === "clean" ? "✅ You stayed clean." : "⚠️ You slipped" + (e.trigger ? " — trigger: " + e.trigger : "") + ".");
      t.style.fontWeight = "600";
      wrap.appendChild(t);
      var ch = rcBtn("Change this answer", "priority-change-link", function () { rcGo("dash", { id: j.id, changing: dateKey }); });
      wrap.appendChild(ch);
    } else {
      var row = rcEl("div", "rec-check-row");
      row.appendChild(rcBtn("✅ I stayed clean today", "btn btn-primary", function () { record("clean"); }));
      row.appendChild(rcBtn("⚠️ I slipped today", "btn btn-outline", function () { record("slip"); }));
      if (dateKey !== todayKey()) {
        row.childNodes[0].textContent = "✅ I stayed clean";
        row.childNodes[1].textContent = "⚠️ I slipped";
      }
      wrap.appendChild(row);
    }
    content.appendChild(wrap);
  }

  function renderRcDash(content) {
    var j = rcJourneys().filter(function (x) { return x.id === rcView.id; })[0];
    if (!j) { rcGo("main"); return; }
    var s = rcCompute(j);
    var today = todayKey();
    rcBack(content, function () { rcGo("main"); });
    content.appendChild(rcEl("h2", "", rcName(j) + " Recovery"));
    content.appendChild(rcEl("p", "muted-line", "Started " + rcFmtDate(j.startDate) + (s.started ? "" : " (not yet)")));

    var urge = rcBtn("I'm having an urge", "btn btn-primary btn-full", function () { startRcUrge(j.id); });
    urge.style.margin = "14px 0";
    content.appendChild(urge);

    if (!s.started) {
      content.appendChild(rcEl("p", "muted-line", "Your recovery starts on " + rcFmtDate(j.startDate) + ". Check-ins open that day."));
      content.appendChild(rcBtn("Start today instead", "action-btn primary", function () {
        var list = rcJourneys();
        list.forEach(function (x) { if (x.id === j.id) x.startDate = today; });
        rcSaveJourneys(list);
        renderRecovery();
      }));
    } else {
      var changing = rcView.changing;
      if (changing) rcCheckinBlock(content, j, changing, changing === today ? "Change today's answer" : "Check-in for " + rcFmtDate(changing));
      else {
        rcCheckinBlock(content, j, today, "Today's check-in");
        var y = rcAddDays(today, -1);
        if (y >= j.startDate && !s.logs[y]) {
          content.appendChild(rcBtn("Add yesterday's check-in", "priority-change-link", function () { rcGo("dash", { id: j.id, changing: y }); }));
        }
      }
    }

    // stats
    var tiles = rcEl("div", "money-stat-grid");
    tiles.style.marginTop = "16px";
    [["Current streak", s.current + (s.current === 1 ? " day" : " days")], ["Best streak", s.best + (s.best === 1 ? " day" : " days")], ["Successful days", String(s.clean)]].forEach(function (r) {
      var t = rcEl("div", "money-stat-tile");
      t.appendChild(rcEl("span", "big", r[1]));
      t.appendChild(rcEl("span", "lbl", r[0]));
      tiles.appendChild(t);
    });
    content.appendChild(tiles);

    var weekDays = s.weekDays.filter(function (d) { return d.status === "clean"; }).length;
    content.appendChild(rcEl("p", "", "This week: " + weekDays + "/7 days")).style.fontWeight = "600";
    var graph = rcEl("div", "rec-week-row");
    s.weekDays.forEach(function (d) {
      var w = rcEl("div", "rec-bar-wrap");
      w.appendChild(rcEl("div", "rec-bar" + (d.status ? " " + d.status : "")));
      w.appendChild(rcEl("span", "rec-label", new Date(d.key + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3)));
      graph.appendChild(w);
    });
    content.appendChild(graph);
    content.appendChild(rcEl("p", "muted-line", "Green = stayed clean · Gold = slipped · Empty = no check-in"));

    // smoking money
    var m = rcMoney(j, s);
    if (m) {
      content.appendChild(rcEl("h2", "", "Money saved")).style.marginTop = "18px";
      var box = rcEl("div", "money-cost-breakdown");
      function line(label, value, hl) {
        var r = rcEl("div", "row" + (hl ? " highlight" : ""));
        r.appendChild(rcEl("span", "", label));
        r.appendChild(rcEl("span", "", value));
        box.appendChild(r);
      }
      line(s.clean + " smoke-free day" + (s.clean === 1 ? "" : "s"), fmtRupee(m.total) + " saved", true);
      line("Cigarettes avoided", String(m.cigsAvoided));
      line("Saved this week", fmtRupee(m.week));
      line("Total saved", fmtRupee(m.total));
      content.appendChild(box);
      if (j.savingGoal > 0) {
        var pct = Math.min(100, Math.round((m.total / j.savingGoal) * 100));
        content.appendChild(rcEl("p", "muted-line", "Goal: " + fmtRupee(m.total) + " / " + fmtRupee(j.savingGoal) + " · " + pct + "%"));
        var track = rcEl("div", "plan-progress-track");
        var fill = rcEl("div", "plan-progress-fill");
        fill.style.width = pct + "%";
        track.appendChild(fill);
        content.appendChild(track);
        if (m.total >= j.savingGoal) content.appendChild(rcEl("p", "rec-note", "🎉 You reached your " + fmtRupee(j.savingGoal) + " goal."));
      }
      content.appendChild(rcEl("p", "muted-line", "Counted only from days you checked in clean."));
    }

    // weekly report
    content.appendChild(rcEl("h2", "", "This week")).style.marginTop = "18px";
    var report = rcEl("div", "money-cost-breakdown");
    function rline(label, value, hl) {
      var r = rcEl("div", "row" + (hl ? " highlight" : ""));
      r.appendChild(rcEl("span", "", label));
      r.appendChild(rcEl("span", "", value));
      report.appendChild(r);
    }
    rline("Successful days", s.week.clean + " (last week " + s.prev.clean + ")");
    rline("Slips", s.week.slips + " (last week " + s.prev.slips + ")");
    rline("Current streak", s.current + " days");
    rline("Best streak", s.best + " days");
    var diff = s.week.clean - s.prev.clean;
    rline("Compared with last week", diff === 0 ? "Same" : (diff > 0 ? "↑ " : "↓ ") + Math.abs(diff) + " clean day" + (Math.abs(diff) === 1 ? "" : "s"), true);
    if (m) rline("Money saved this week", fmtRupee(m.week));
    var passed = rcUrges().filter(function (u) { return (u.journeyId === j.id) && u.passed && u.date >= getLastNDateKeys(7)[6]; }).length;
    if (passed) rline("Urges you got through", String(passed));
    content.appendChild(report);
    var tcWeek = rcTriggerCounts(s.logs, getLastNDateKeys(7)[6]);
    var tcAll = rcTriggerCounts(s.logs, null);
    var topWeek = rcTopTrigger(tcWeek), topAll = rcTopTrigger(tcAll);
    if (topAll) content.appendChild(rcEl("p", "muted-line", "Trigger pattern: " + (topWeek ? "this week " + topWeek + "; " : "") + "overall " + topAll + "."));
    else content.appendChild(rcEl("p", "muted-line", "Trigger patterns appear here once you've recorded a trigger."));
    content.appendChild(rcEl("p", "rec-note", "The goal is long-term improvement, not a perfect streak."));

    if (j.why) {
      content.appendChild(rcEl("h2", "", "Why I'm doing this")).style.marginTop = "16px";
      content.appendChild(rcEl("p", "muted-line", j.why));
    }
    if (j.goal) content.appendChild(rcEl("p", "muted-line", "Goal: " + j.goal));

    var del = rcBtn("Delete this recovery and its data", "priority-change-link", function () {
      if (!window.confirm("Delete this recovery journey and all its check-ins from this device? This can't be undone.")) return;
      rcSaveJourneys(rcJourneys().filter(function (x) { return x.id !== j.id; }));
      var logs = rcLogsAll();
      delete logs[j.id];
      writeJSON("nc_recovery_logs", logs);
      writeJSON("nc_recovery_urges", rcUrges().filter(function (u) { return u.journeyId !== j.id; }));
      showToast("Deleted");
      rcGo("main");
    });
    del.style.marginTop = "18px";
    content.appendChild(del);
  }

  // ---- After a slip ----

  function renderRcSlip(content) {
    var j = rcJourneys().filter(function (x) { return x.id === rcView.id; })[0];
    if (!j) { rcGo("main"); return; }
    var s = rcCompute(j);
    content.appendChild(rcEl("p", "rec-note", "You slipped today, but your previous progress still counts. Understand what triggered it and restart."));
    content.appendChild(rcEl("p", "muted-line", "Your best streak (" + s.best + " day" + (s.best === 1 ? "" : "s") + ") and your " + s.clean + " successful day" + (s.clean === 1 ? "" : "s") + " are still yours. One day doesn't erase them."));
    content.appendChild(rcEl("h2", "", "What triggered you?")).style.marginTop = "14px";
    var chips = rcEl("div", "money-quick-actions");
    RC_TRIGGERS.forEach(function (t) {
      chips.appendChild(rcBtn(t, "preset-plan-chip", function () {
        var e = (rcLogsAll()[j.id] || {})[rcView.dateKey] || { status: "slip", at: new Date().toISOString() };
        e.trigger = t;
        rcSetLog(j.id, rcView.dateKey, e);
        showToast("Saved privately");
        rcGo("dash", { id: j.id });
      }));
    });
    content.appendChild(chips);
    content.appendChild(rcBtn("Skip for now", "priority-change-link", function () { rcGo("dash", { id: j.id }); }));
  }

  // ---- Urge ----

  function startRcUrge(journeyId) {
    var list = rcUrges();
    var rec = { id: uid("urge"), journeyId: journeyId, date: todayKey(), at: new Date().toISOString(), passed: false };
    list.push(rec);
    writeJSON("nc_recovery_urges", list);
    rcGo("urge", { journeyId: journeyId, urgeId: rec.id, done: {}, timerEnd: null });
  }

  function renderRcUrge(content) {
    rcBack(content, function () { rcGo(rcView.journeyId ? "dash" : "main", rcView.journeyId ? { id: rcView.journeyId } : {}); });
    content.appendChild(rcEl("h2", "", "Take a breath."));
    content.appendChild(rcEl("p", "muted-line", "You don't have to act on this. Pick one small thing and do it now."));
    var list = rcEl("div", "");
    list.style.marginTop = "12px";
    RC_URGE_ACTIONS.forEach(function (a, i) {
      var b = rcBtn((rcView.done[i] ? "✓ " : "") + a, "rec-action" + (rcView.done[i] ? " done" : ""), function () {
        rcView.done[i] = !rcView.done[i];
        var keepEnd = rcView.timerEnd;
        renderRecovery();
        rcView.timerEnd = keepEnd;
      });
      list.appendChild(b);
    });
    content.appendChild(list);

    // 10-minute distraction timer
    var timerBox = rcEl("div", "money-cost-breakdown");
    timerBox.style.textAlign = "center";
    var time = rcEl("div", "rec-timer", "10:00");
    var msg = rcEl("p", "muted-line", "Start a 10-minute distraction timer. Do anything else until it ends.");
    var startT = rcBtn("Start 10-minute timer", "btn btn-primary btn-full", function () {
      rcView.timerEnd = Date.now() + 600000;
      startT.style.display = "none";
      runTimer();
    });
    function runTimer() {
      rcStopTimer();
      function tick() {
        if (!document.body.contains(time)) { rcStopTimer(); return; }
        var left = Math.max(0, rcView.timerEnd - Date.now());
        var m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
        time.textContent = m + ":" + (s < 10 ? "0" : "") + s;
        if (left <= 0) { rcStopTimer(); msg.textContent = "10 minutes done. Urges usually ease with time. How do you feel?"; }
        else msg.textContent = "Keep going. Do anything except the habit.";
      }
      tick();
      rcTimerId = setInterval(tick, 500);
    }
    timerBox.appendChild(time);
    timerBox.appendChild(msg);
    timerBox.appendChild(startT);
    content.appendChild(timerBox);
    if (rcView.timerEnd) { startT.style.display = "none"; runTimer(); }

    content.appendChild(rcEl("h2", "", "Something useful")).style.marginTop = "14px";
    content.appendChild(rcBtn("Open duas (Sunnah)", "btn btn-outline btn-full", function () { rcStopTimer(); setActiveView("sunnah"); }));

    // trusted contact
    var contact = rcContact();
    content.appendChild(rcEl("h2", "", "Someone you trust")).style.marginTop = "14px";
    if (contact && contact.phone && !rcView.editContact) {
      var call = rcEl("a", "btn btn-primary btn-full", "Call " + (contact.name || "them"));
      call.href = "tel:" + contact.phone;
      call.style.display = "block";
      call.style.textAlign = "center";
      call.style.textDecoration = "none";
      content.appendChild(call);
      content.appendChild(rcBtn("Change contact", "priority-change-link", function () { rcView.editContact = true; var k = rcView.timerEnd; renderRecovery(); rcView.timerEnd = k; }));
    } else {
      content.appendChild(rcEl("p", "muted-line", "Optional. Stored only on this device."));
      var nm = rcEl("input", "text-input");
      nm.type = "text"; nm.placeholder = "Name"; nm.value = contact ? contact.name || "" : "";
      var ph = rcEl("input", "text-input");
      ph.type = "tel"; ph.placeholder = "Phone number"; ph.value = contact ? contact.phone || "" : "";
      content.appendChild(nm);
      content.appendChild(ph);
      content.appendChild(rcBtn("Save contact", "btn btn-outline btn-full", function () {
        var phone = ph.value.replace(/[^0-9+]/g, "");
        if (!phone) { showToast("Enter a phone number"); return; }
        writeJSON("nc_recovery_contact", { name: nm.value.trim().slice(0, 40), phone: phone });
        rcView.editContact = false;
        var k = rcView.timerEnd; renderRecovery(); rcView.timerEnd = k;
      }));
    }

    var got = rcBtn("I got through this urge", "btn btn-primary btn-full", function () {
      var list2 = rcUrges();
      list2.forEach(function (u) { if (u.id === rcView.urgeId) u.passed = true; });
      writeJSON("nc_recovery_urges", list2);
      showToast("Well done for pausing");
      rcGo(rcView.journeyId ? "dash" : "main", rcView.journeyId ? { id: rcView.journeyId } : {});
    });
    got.style.marginTop = "18px";
    content.appendChild(got);
  }

  function initRecovery() {
    document.getElementById("open-recovery-btn").addEventListener("click", function () { rcView = { screen: "main" }; setActiveView("duniya-recovery"); });
    document.getElementById("duniya-recovery-back").addEventListener("click", function () { rcStopTimer(); rcView = { screen: "main" }; setActiveView("duniya-habits"); });
  }

  // Neutral totals only (no habit names) for the Home-adjacent Progress Details.
  function rcProgressRows() {
    var journeys = rcJourneys();
    if (!journeys.length) return [];
    var clean = 0, slips = 0, prevClean = 0, current = 0, money = 0, anyMoney = false;
    journeys.forEach(function (j) {
      var s = rcCompute(j);
      clean += s.week.clean; slips += s.week.slips; prevClean += s.prev.clean;
      if (s.current > current) current = s.current;
      var m = rcMoney(j, s);
      if (m) { money += m.week; anyMoney = true; }
    });
    var rows = [
      { label: "Recovery — successful days (7 days)", value: String(clean) },
      { label: "Recovery — slips", value: String(slips) },
      { label: "Recovery — current streak", value: current + (current === 1 ? " day" : " days") }
    ];
    var diff = clean - prevClean;
    rows.push({ label: "Recovery — vs. previous week", value: diff === 0 ? "Same" : (diff > 0 ? "↑ " : "↓ ") + Math.abs(diff) + " day" + (Math.abs(diff) === 1 ? "" : "s") });
    if (anyMoney) rows.push({ label: "Recovery — money saved (7 days)", value: fmtRupee(money) });
    return rows;
  }

  // ---- Personal Growth ----

  var DUNIYA_GROWTH_AREAS = [
    { key: "confidence", label: "Confidence", exercise: "Start one conversation yourself today — don't wait for the other person." },
    { key: "communication", label: "Communication", exercise: "In your next conversation, ask one real follow-up question instead of just replying." },
    { key: "discipline", label: "Discipline", exercise: "Do the one task you've been avoiding, for just 10 minutes." },
    { key: "time", label: "Time Management", exercise: "Write down what you'll do in the next hour before you start it." },
    { key: "decisions", label: "Decision Making", exercise: "Pick a small pending decision and make it today — don't leave it open." },
    { key: "reading", label: "Reading", exercise: "Read for 10 minutes, no phone nearby." },
    { key: "consistency", label: "Consistency", exercise: "Do one thing today exactly the way you did it yesterday — on purpose." }
  ];

  function renderDuniyaGrowth() {
    var content = document.getElementById("duniya-growth-content");
    content.innerHTML = "";
    var log = readJSON("nc_duniya_growth_log", {});
    var todayEntry = log[todayKey()];

    if (!todayEntry) {
      var h2 = document.createElement("h2");
      h2.textContent = "What do you want to work on?";
      content.appendChild(h2);
      var grid = document.createElement("div");
      grid.className = "preset-plan-grid";
      DUNIYA_GROWTH_AREAS.forEach(function (g) {
        var btn = document.createElement("button");
        btn.className = "preset-plan-chip";
        btn.textContent = g.label;
        btn.addEventListener("click", function () {
          var allLog = readJSON("nc_duniya_growth_log", {});
          allLog[todayKey()] = { key: g.key, done: false };
          writeJSON("nc_duniya_growth_log", allLog);
          renderDuniyaGrowth();
        });
        grid.appendChild(btn);
      });
      content.appendChild(grid);
      return;
    }

    var area = DUNIYA_GROWTH_AREAS.find(function (g) { return g.key === todayEntry.key; });
    var h2b = document.createElement("h2");
    h2b.textContent = area.label;
    content.appendChild(h2b);
    var exercise = document.createElement("p");
    exercise.className = "priority-why";
    exercise.textContent = area.exercise;
    content.appendChild(exercise);
    var doneBtn = document.createElement("button");
    doneBtn.className = "btn btn-primary btn-full";
    doneBtn.textContent = todayEntry.done ? "Done today ✓" : "Mark done";
    doneBtn.disabled = todayEntry.done;
    doneBtn.addEventListener("click", function () {
      var allLog = readJSON("nc_duniya_growth_log", {});
      allLog[todayKey()].done = true;
      writeJSON("nc_duniya_growth_log", allLog);
      renderDuniyaGrowth();
    });
    content.appendChild(doneBtn);
    var changeBtn = document.createElement("button");
    changeBtn.className = "priority-change-link";
    changeBtn.textContent = "Choose a different area";
    changeBtn.addEventListener("click", function () {
      var allLog = readJSON("nc_duniya_growth_log", {});
      delete allLog[todayKey()];
      writeJSON("nc_duniya_growth_log", allLog);
      renderDuniyaGrowth();
    });
    content.appendChild(changeBtn);
  }

  function initDuniyaGrowth() {
    document.getElementById("duniya-growth-back").addEventListener("click", function () { setActiveView("duniya"); });
  }

  // ---------- PLAN MY DAY ----------
  // A real, deterministic day-scheduling engine (locked/fixed activities,
  // gap detection, priority-ordered flexible placement, conflict
  // detection) — no AI, no chat, no generated advice anywhere in this
  // flow. USER DECIDES -> NURA ORGANIZES -> USER FOLLOWS.

  var PLAN_DUNYA_CATEGORIES = ["College", "School", "Studies", "Career", "Work", "Tuition", "Fitness", "Gym", "Family", "Personal", "Errands", "Rest", "Meals", "Sleep", "Other"];
  var PLAN_DEEN_CATEGORIES = ["Salah", "Quran", "Dhikr", "Dua", "Islamic learning", "Sunnah habit", "Other deen activity"];
  var PLAN_SUNNAH_ITEMS = [
    { key: "morning-adhkar", label: "Morning Adhkar", minutes: 10, anchor: "after-fajr" },
    { key: "evening-adhkar", label: "Evening Adhkar", minutes: 10, anchor: "after-asr" },
    { key: "quran-reading", label: "Quran reading", minutes: 15, anchor: "after-fajr" },
    { key: "dua-waking", label: "Dua after waking", minutes: 5, anchor: "after-fajr" },
    { key: "dhikr", label: "Dhikr", minutes: 10, anchor: "any" },
    { key: "islamic-learning", label: "Short Islamic learning", minutes: 15, anchor: "any" },
    { key: "before-sleep", label: "Before-sleep routine", minutes: 15, anchor: "end-of-day" }
  ];

  function getPlanActivities() { return readJSON("nc_plan_activities_" + todayKey(), []); }
  function savePlanActivities(list) { writeJSON("nc_plan_activities_" + todayKey(), list); }
  function getPlanSettings() {
    return readJSON("nc_plan_settings_" + todayKey(), {
      dayStart: "06:00", dayEnd: "23:00", sunnahEnabled: readJSON("nc_plan_sunnah_defaults", {}),
      bufferStyle: "normal", priorities: { top3: [], mustNotMiss: null }, orderRules: [], note: ""
    });
  }
  function savePlanSettings(s) { writeJSON("nc_plan_settings_" + todayKey(), s); }
  function getPlanBuilt() { return readJSON("nc_plan_built_" + todayKey(), null); }
  function savePlanBuilt(result) { writeJSON("nc_plan_built_" + todayKey(), result); }

  function planTimeToMinutes(hhmm) {
    var p = hhmm.split(":");
    return Number(p[0]) * 60 + Number(p[1]);
  }
  function planMinutesToClock(mins) {
    mins = ((Math.round(mins) % 1440) + 1440) % 1440;
    var h = Math.floor(mins / 60), m = mins % 60;
    var period = h >= 12 ? "PM" : "AM";
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + String(m).padStart(2, "0") + " " + period;
  }

  var PLAN_BUFFER_MINUTES = { tight: 5, normal: 15, relaxed: 30 };

  function computePlanSchedule(activities, settings, prayerTimings, fromMin) {
    var dayStartMin = planTimeToMinutes(settings.dayStart);
    var dayEndMin = planTimeToMinutes(settings.dayEnd);
    var lowerBound = fromMin != null ? Math.max(fromMin, dayStartMin) : dayStartMin;
    var BREAK_MIN = PLAN_BUFFER_MINUTES[settings.bufferStyle] || 15;
    var priorities = settings.priorities || { top3: [], mustNotMiss: null };
    var orderRules = settings.orderRules || []; // [{firstId, secondId}] firstId must end before secondId starts

    var locked = [];
    activities.filter(function (a) { return a.mode === "fixed" && a.startTime && a.status !== "skipped"; }).forEach(function (a) {
      var s = planTimeToMinutes(a.startTime);
      var e = a.endTime ? planTimeToMinutes(a.endTime) : s + (Number(a.durationMinutes) || 60);
      var prep = Number(a.prepMinutes) || 0;
      var travelBefore = Number(a.travelBeforeMinutes) || 0;
      var travelAfter = Number(a.travelAfterMinutes) || 0;
      if (travelBefore > 0) locked.push({ startMin: s - prep - travelBefore, endMin: s - prep, label: "Leave for " + a.name, kind: "travel", refId: a.id + "-travel" });
      if (prep > 0) locked.push({ startMin: s - prep, endMin: s, label: "Get ready for " + a.name, kind: "prep", refId: a.id + "-prep" });
      locked.push({ startMin: s, endMin: e, label: a.name, kind: "fixed", refId: a.id, activity: a });
      if (travelAfter > 0) locked.push({ startMin: e, endMin: e + travelAfter, label: "Travel back from " + a.name, kind: "travel", refId: a.id + "-travelback" });
    });

    if (prayerTimings) {
      PRAYER_ORDER.forEach(function (name) {
        var t = prayerTimings[name];
        if (!t) return;
        var s = planTimeToMinutes(t);
        locked.push({ startMin: s, endMin: s + 15, label: name, kind: "prayer", refId: "prayer-" + name });
      });
    }

    var conflicts = [];
    for (var i = 0; i < locked.length; i++) {
      for (var j = i + 1; j < locked.length; j++) {
        var A = locked[i], B = locked[j];
        var bothMeaningful = (A.kind === "fixed" || A.kind === "prayer") && (B.kind === "fixed" || B.kind === "prayer");
        if (bothMeaningful && A.startMin < B.endMin && B.startMin < A.endMin) {
          conflicts.push({ labelA: A.label, labelB: B.label, refA: A.refId, refB: B.refId, overlapMinutes: Math.min(A.endMin, B.endMin) - Math.max(A.startMin, B.startMin), isPrayer: A.kind === "prayer" || B.kind === "prayer" });
        }
      }
    }

    var merged = [];
    locked.slice().sort(function (a, b) { return a.startMin - b.startMin; }).forEach(function (b) {
      var start = Math.max(b.startMin, lowerBound), end = Math.min(b.endMin, dayEndMin);
      if (end <= start) return;
      if (!merged.length || start > merged[merged.length - 1].end) merged.push({ start: start, end: end });
      else merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, end);
    });
    var gaps = [];
    var cursor = lowerBound;
    merged.forEach(function (m) {
      if (m.start > cursor) gaps.push({ start: cursor, end: m.start });
      cursor = Math.max(cursor, m.end);
    });
    if (cursor < dayEndMin) gaps.push({ start: cursor, end: dayEndMin });

    // Flexible items: user-entered flexible + protected personal/life items + enabled Sunnah habits
    var flexItems = activities.filter(function (a) { return a.mode === "flexible" && a.status !== "done" && a.status !== "skipped"; }).map(function (a) {
      var rank = 3; // default: ranked by declared priority below
      if (priorities.mustNotMiss === a.id) rank = 0;
      else if (priorities.top3 && priorities.top3.indexOf(a.id) !== -1) rank = 1 + priorities.top3.indexOf(a.id) * 0.1;
      return { id: a.id, label: a.name, minutes: Number(a.durationMinutes) || 30, priority: a.priority || "medium", kind: a.isPersonal ? "personal" : "flexible", activity: a, anchorAfter: null, rank: a.isPersonal ? -1 : rank, dependsOn: a.dependsOnId || null };
    });
    (settings.sunnahEnabled ? Object.keys(settings.sunnahEnabled) : []).forEach(function (key) {
      if (!settings.sunnahEnabled[key]) return;
      var def = PLAN_SUNNAH_ITEMS.find(function (s) { return s.key === key; });
      if (!def) return;
      var anchorMin = null;
      if (def.anchor === "after-fajr" && prayerTimings && prayerTimings.Fajr) anchorMin = planTimeToMinutes(prayerTimings.Fajr) + 15;
      if (def.anchor === "after-asr" && prayerTimings && prayerTimings.Asr) anchorMin = planTimeToMinutes(prayerTimings.Asr) + 15;
      if (def.anchor === "end-of-day") anchorMin = dayEndMin - 60;
      flexItems.push({ id: "sunnah-" + def.key, label: def.label, minutes: def.minutes, priority: "high", kind: "sunnah", anchorAfter: anchorMin, rank: -1, dependsOn: null });
    });

    var priorityRank = { high: 0, medium: 1, low: 2 };
    // Order-rule dependency graph: build placement order via repeated passes so a "before" item
    // is always placed before its "after" item gets a chance (never silently violated).
    var idToItem = {}; flexItems.forEach(function (it) { idToItem[it.id] = it; });
    orderRules.forEach(function (r) {
      var afterItem = idToItem[r.secondId];
      if (afterItem) afterItem.dependsOn = r.firstId;
    });

    function baseSort(a, b) {
      if (a.anchorAfter !== null && b.anchorAfter !== null) return a.anchorAfter - b.anchorAfter;
      if (a.anchorAfter !== null) return -1;
      if (b.anchorAfter !== null) return 1;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return priorityRank[a.priority] - priorityRank[b.priority];
    }

    var placed = [];
    var unfit = [];
    var placedIds = {};
    var pending = flexItems.slice();
    var guardLoops = pending.length + 2;

    function placeOne(item) {
      var effectiveAnchor = item.anchorAfter;
      if (item.dependsOn && placedIds[item.dependsOn] != null) {
        effectiveAnchor = effectiveAnchor === null ? placedIds[item.dependsOn] : Math.max(effectiveAnchor, placedIds[item.dependsOn]);
      }
      var chosenIdx = -1, chosenStart = 0;
      for (var g = 0; g < gaps.length; g++) {
        var usableStart = Math.max(gaps[g].start, effectiveAnchor || gaps[g].start);
        if (gaps[g].end - usableStart >= item.minutes) { chosenIdx = g; chosenStart = usableStart; break; }
      }
      if (chosenIdx === -1) { unfit.push(item); placedIds[item.id] = -1; return; }
      var start = chosenStart, end = start + item.minutes;
      placed.push({ startMin: start, endMin: end, label: item.label, kind: item.kind, refId: item.id, activity: item.activity });
      placedIds[item.id] = end;
      var gap = gaps[chosenIdx];
      var remainderStart = (gap.end - end >= BREAK_MIN) ? end + BREAK_MIN : end;
      var newGaps = [];
      if (start > gap.start) newGaps.push({ start: gap.start, end: start });
      if (remainderStart < gap.end) newGaps.push({ start: remainderStart, end: gap.end });
      gaps.splice.apply(gaps, [chosenIdx, 1].concat(newGaps));
    }

    while (pending.length && guardLoops-- > 0) {
      pending.sort(baseSort);
      var ready = pending.filter(function (it) { return !it.dependsOn || placedIds[it.dependsOn] != null; });
      if (!ready.length) { pending.forEach(function (it) { unfit.push(it); }); break; }
      placeOne(ready[0]);
      pending = pending.filter(function (it) { return it.id !== ready[0].id; });
    }

    var timeline = [];
    locked.forEach(function (b) { if (b.endMin > lowerBound) timeline.push(b); });
    placed.forEach(function (b) { timeline.push(b); });
    gaps.forEach(function (g) { if (g.end - g.start >= 10) timeline.push({ startMin: g.start, endMin: g.end, label: "Free Time", kind: "free" }); });
    timeline.sort(function (a, b) { return a.startMin - b.startMin; });

    return { timeline: timeline, conflicts: conflicts, unfit: unfit };
  }

  function runBuildMyDay() {
    var activities = getPlanActivities();
    var settings = getPlanSettings();
    var prayerSettings = getPrayerSettings();
    var proceed = function (timings) {
      var result = computePlanSchedule(activities, settings, timings, null);
      savePlanBuilt(result);
      renderDuniyaPlan();
    };
    if (prayerSettings) {
      fetchPrayerTimesForToday().then(proceed).catch(function () { proceed(null); });
    } else {
      proceed(null);
    }
  }

  function adjustRemainingDay() {
    var built = getPlanBuilt();
    if (!built) return;
    var activities = getPlanActivities();
    var settings = getPlanSettings();
    var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    var prayerSettings = getPrayerSettings();
    var proceed = function (timings) {
      var result = computePlanSchedule(activities, settings, timings, nowMin);
      // keep already-past locked/placed entries from the old timeline so the day's history isn't erased
      var past = built.timeline.filter(function (e) { return e.endMin <= nowMin; });
      result.timeline = past.concat(result.timeline);
      savePlanBuilt(result);
      renderDuniyaPlan();
      showToast("Remaining day adjusted");
    };
    if (prayerSettings) {
      fetchPrayerTimesForToday().then(proceed).catch(function () { proceed(null); });
    } else {
      proceed(null);
    }
  }

  function setPlanActivityStatus(activityId, status) {
    var activities = getPlanActivities();
    activities.forEach(function (a) { if (a.id === activityId) a.status = status; });
    savePlanActivities(activities);
    var built = getPlanBuilt();
    if (built) {
      built.timeline.forEach(function (e) { if (e.refId === activityId) e.status = status; });
      savePlanBuilt(built);
    }
    renderDuniyaPlan();
  }

  function renderPlanProgress(container, timeline) {
    var trackable = timeline.filter(function (e) { return e.kind === "fixed" || e.kind === "flexible" || e.kind === "sunnah" || e.kind === "prayer"; });
    var done = trackable.filter(function (e) {
      if (e.kind === "prayer") return false;
      var a = getPlanActivities().find(function (x) { return x.id === e.refId; });
      return a && a.status === "done";
    });
    var total = trackable.filter(function (e) { return e.kind !== "prayer"; }).length;
    var pct = total ? Math.round((done.length / total) * 100) : 0;

    var deenTotal = 0, deenDone = 0, dunyaTotal = 0, dunyaDone = 0;
    trackable.forEach(function (e) {
      if (e.kind === "prayer") return;
      var isDeen = e.kind === "sunnah" || (e.activity && e.activity.category === "deen");
      var a = getPlanActivities().find(function (x) { return x.id === e.refId; });
      var isDone = a && a.status === "done";
      if (isDeen) { deenTotal++; if (isDone) deenDone++; } else { dunyaTotal++; if (isDone) dunyaDone++; }
    });

    var wrap = document.createElement("div");
    var track = document.createElement("div");
    track.className = "plan-progress-track";
    var fill = document.createElement("div");
    fill.className = "plan-progress-fill";
    fill.style.width = pct + "%";
    track.appendChild(fill);
    wrap.appendChild(track);
    var line = document.createElement("p");
    line.className = "muted-line";
    line.textContent = pct + "% — " + done.length + " of " + total + " activities completed";
    wrap.appendChild(line);

    var tiles = document.createElement("div");
    tiles.className = "plan-progress-summary";
    tiles.innerHTML =
      '<div class="plan-progress-tile"><span class="big">' + deenDone + "/" + deenTotal + '</span><span class="lbl">DEEN</span></div>' +
      '<div class="plan-progress-tile"><span class="big">' + dunyaDone + "/" + dunyaTotal + '</span><span class="lbl">DUNYA</span></div>';
    wrap.appendChild(tiles);
    container.appendChild(wrap);
  }

  function renderPlanTimelineItem(entry) {
    var item = document.createElement("div");
    item.className = "plan-timeline-item";

    var dot = document.createElement("div");
    var isDeen = entry.kind === "prayer" || entry.kind === "sunnah" || (entry.activity && entry.activity.category === "deen");
    dot.className = "plan-timeline-dot" + (isDeen ? " deen" : "") + (entry.kind === "free" ? " free" : "");
    item.appendChild(dot);

    if (entry.kind === "free") {
      var freeBody = document.createElement("div");
      freeBody.className = "plan-timeline-free";
      freeBody.textContent = planMinutesToClock(entry.startMin) + " – " + planMinutesToClock(entry.endMin) + " · Free Time (" + (entry.endMin - entry.startMin) + " min) — study, rest, Quran, walk, or prepare for what's next.";
      item.appendChild(freeBody);
      return item;
    }

    var body = document.createElement("div");
    var activity = entry.refId ? getPlanActivities().find(function (a) { return a.id === entry.refId; }) : null;
    var status = activity ? activity.status : (entry.kind === "prayer" ? null : "pending");
    body.className = "plan-timeline-body" + (status === "done" ? " done" : "");

    var time = document.createElement("p");
    time.className = "plan-timeline-time";
    time.textContent = entry.endMin - entry.startMin > 1 ? (planMinutesToClock(entry.startMin) + " – " + planMinutesToClock(entry.endMin)) : planMinutesToClock(entry.startMin);
    body.appendChild(time);

    var name = document.createElement("p");
    name.className = "plan-timeline-name" + (status === "done" ? " done" : "");
    name.textContent = entry.label;
    body.appendChild(name);

    if (entry.kind === "fixed" || entry.kind === "flexible" || entry.kind === "sunnah") {
      var meta = document.createElement("p");
      meta.className = "plan-timeline-meta";
      meta.textContent = (entry.kind === "sunnah" ? "Sunnah" : (entry.kind === "fixed" ? "Fixed" : "Flexible")) + (status === "skipped" ? " · Skipped" : "") + (status === "delayed" ? " · Delayed" : "");
      body.appendChild(meta);
    }

    if (entry.refId && status !== "done" && status !== "skipped" && (entry.kind === "fixed" || entry.kind === "flexible" || entry.kind === "sunnah")) {
      var actions = document.createElement("div");
      actions.className = "plan-timeline-actions";
      if (entry.activity && entry.activity.category === "Studies" || (entry.activity && entry.activity.type === "study")) {
        var startBtn = document.createElement("button");
        startBtn.className = "action-btn primary";
        startBtn.textContent = "Start";
        startBtn.addEventListener("click", function () {
          startAdhocFocus(entry.label, entry.endMin - entry.startMin);
          setActiveView("home");
        });
        actions.appendChild(startBtn);
      }
      var doneBtn = document.createElement("button");
      doneBtn.className = "action-btn primary";
      doneBtn.textContent = "Done";
      doneBtn.addEventListener("click", function () { setPlanActivityStatus(entry.refId, "done"); });
      actions.appendChild(doneBtn);
      var skipBtn = document.createElement("button");
      skipBtn.className = "action-btn warn";
      skipBtn.textContent = "Skip";
      skipBtn.addEventListener("click", function () { setPlanActivityStatus(entry.refId, "skipped"); });
      actions.appendChild(skipBtn);
      if (entry.kind !== "sunnah") {
        var delayBtn = document.createElement("button");
        delayBtn.className = "action-btn";
        delayBtn.textContent = "Delay";
        delayBtn.addEventListener("click", function () { setPlanActivityStatus(entry.refId, "delayed"); adjustRemainingDay(); });
        actions.appendChild(delayBtn);
      }
      body.appendChild(actions);
    }

    item.appendChild(body);
    return item;
  }

  function renderPlanTimelineView(content, built) {
    var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    var nextPrayer = null;
    if (getPrayerSettings()) {
      var nextEntry = built.timeline.find(function (e) { return e.kind === "prayer" && e.startMin >= nowMin; });
      if (nextEntry) nextPrayer = nextEntry.label + " — " + planMinutesToClock(nextEntry.startMin);
    }
    if (nextPrayer) {
      var nextP = document.createElement("p");
      nextP.className = "muted-line";
      nextP.style.marginBottom = "10px";
      nextP.textContent = "Next Salah: " + nextPrayer;
      content.appendChild(nextP);
    }

    renderPlanProgress(content, built.timeline);

    var currentEntry = built.timeline.find(function (e) {
      return e.startMin <= nowMin && nowMin < e.endMin && (e.kind === "fixed" || e.kind === "flexible" || e.kind === "sunnah");
    });
    if (currentEntry) {
      var activity = getPlanActivities().find(function (a) { return a.id === currentEntry.refId; });
      var isLate = activity && activity.status === "pending" && nowMin > currentEntry.startMin + 15;
      if (isLate) {
        var lateBanner = document.createElement("div");
        lateBanner.className = "plan-conflict-banner";
        lateBanner.style.color = "var(--gold)";
        lateBanner.style.borderColor = "var(--gold)";
        lateBanner.style.background = "rgba(201, 162, 39, 0.1)";
        lateBanner.textContent = "You're running a little behind on “" + currentEntry.label + "”.";
        content.appendChild(lateBanner);
        var lateBtns = document.createElement("div");
        lateBtns.className = "priority-checkin-buttons";
        lateBtns.style.marginBottom = "14px";
        var continueBtn = document.createElement("button");
        continueBtn.className = "action-btn";
        continueBtn.textContent = "Continue as planned";
        continueBtn.addEventListener("click", function () { renderDuniyaPlan(); });
        var adjustNowBtn = document.createElement("button");
        adjustNowBtn.className = "action-btn primary";
        adjustNowBtn.textContent = "Adjust remaining day";
        adjustNowBtn.addEventListener("click", adjustRemainingDay);
        lateBtns.appendChild(continueBtn);
        lateBtns.appendChild(adjustNowBtn);
        content.appendChild(lateBtns);
      }
    }

    if (built.conflicts && built.conflicts.length) {
      built.conflicts.forEach(function (c) {
        var banner = document.createElement("div");
        banner.className = "plan-conflict-banner";
        banner.textContent = "⚠️ Time conflict detected — " + c.labelA + " and " + c.labelB + " overlap by " + c.overlapMinutes + " minutes.";
        content.appendChild(banner);
      });
    }
    if (built.unfit && built.unfit.length) {
      var unfitBox = document.createElement("div");
      unfitBox.className = "plan-unfit-list";
      unfitBox.innerHTML = "<strong>You have more planned than realistically fits today:</strong><br>" + built.unfit.map(function (u) { return "• " + u.label + " (" + u.minutes + " min) — needs adjustment"; }).join("<br>");
      content.appendChild(unfitBox);
    }

    var timelineWrap = document.createElement("div");
    timelineWrap.className = "plan-timeline";
    built.timeline.forEach(function (entry) {
      var item = renderPlanTimelineItem(entry);
      if (entry === currentEntry) {
        var nowTag = document.createElement("span");
        nowTag.className = "action-status done";
        nowTag.style.marginLeft = "6px";
        nowTag.textContent = "NOW";
        var nameEl = item.querySelector(".plan-timeline-name");
        if (nameEl) nameEl.appendChild(nowTag);
      }
      timelineWrap.appendChild(item);
    });
    content.appendChild(timelineWrap);

    var adjustBtn = document.createElement("button");
    adjustBtn.className = "btn btn-outline btn-full";
    adjustBtn.textContent = "Adjust Remaining Day";
    adjustBtn.addEventListener("click", adjustRemainingDay);
    content.appendChild(adjustBtn);

    var editBtn = document.createElement("button");
    editBtn.className = "priority-change-link";
    editBtn.textContent = "Edit activities / rebuild";
    editBtn.addEventListener("click", function () { savePlanBuilt(null); renderDuniyaPlan(); });
    content.appendChild(editBtn);
  }

  // ---- Plan My Day: 10-question guided wizard ----
  // Screen 1 -> 10 sequential questions -> Create Today's Plan. Every
  // example (College, Gym, Study...) is placeholder text only, never
  // auto-added. USER DECIDES -> NURA ORGANIZES -> USER ADJUSTS -> FOLLOWS.

  var planWizard = null;
  var PLAN_WIZARD_STEPS = 10;

  function startPlanWizard() {
    planWizard = {
      step: 1,
      data: {
        dayStart: null, dayEnd: null,
        fixedActivities: [], flexibleActivities: [], personalActivities: [],
        priorities: { top3: [], mustNotMiss: null },
        bufferStyle: "normal", orderRules: [], note: "",
        sunnahEnabled: readJSON("nc_plan_sunnah_defaults", {})
      }
    };
    renderDuniyaPlan();
  }
  function planWizardGo(step) { planWizard.step = step; renderDuniyaPlan(); }
  function planWizardNext() { planWizardGo(planWizard.step + 1); }
  function planWizardAllActivities() {
    return planWizard.data.fixedActivities.concat(planWizard.data.flexibleActivities, planWizard.data.personalActivities);
  }

  function buildWizardHeader(content, title) {
    var backBtn = document.createElement("button");
    backBtn.className = "picker-step-back";
    backBtn.textContent = "← Back";
    backBtn.addEventListener("click", function () {
      if (planWizard.step > 1) planWizardGo(planWizard.step - 1);
      else { planWizard = null; renderDuniyaPlan(); }
    });
    content.appendChild(backBtn);
    var stepLine = document.createElement("p");
    stepLine.className = "muted-line";
    stepLine.textContent = "Question " + planWizard.step + " of " + PLAN_WIZARD_STEPS;
    content.appendChild(stepLine);
    var h2 = document.createElement("h2");
    h2.textContent = title;
    content.appendChild(h2);
  }

  function buildActivityAddRow(content, targetArray, opts) {
    var nameInput = document.createElement("input");
    nameInput.type = "text"; nameInput.className = "text-input"; nameInput.placeholder = opts.namePlaceholder;
    content.appendChild(nameInput);
    var extraInputs = opts.buildExtra ? opts.buildExtra(content) : null;
    var addBtn = document.createElement("button");
    addBtn.className = "btn btn-outline btn-full";
    addBtn.textContent = opts.addLabel || "Add";
    addBtn.addEventListener("click", function () {
      var name = nameInput.value.trim();
      if (!name) { showToast("Enter a name first"); return; }
      var entry = opts.makeEntry(name, extraInputs);
      if (entry === false) return;
      targetArray.push(entry);
      nameInput.value = "";
      renderDuniyaPlan();
    });
    content.appendChild(addBtn);
  }

  function buildActivityList(content, targetArray, describeFn) {
    if (!targetArray.length) return;
    targetArray.forEach(function (a) {
      var row = document.createElement("div");
      row.className = "duniya-goal-item";
      var info = document.createElement("span");
      info.className = "name";
      info.textContent = a.name + " — " + describeFn(a);
      var del = document.createElement("button");
      del.className = "action-btn warn";
      del.textContent = "Remove";
      del.addEventListener("click", function () {
        var idx = targetArray.indexOf(a);
        if (idx !== -1) targetArray.splice(idx, 1);
        renderDuniyaPlan();
      });
      row.appendChild(info);
      row.appendChild(del);
      content.appendChild(row);
    });
  }

  function renderWizardStep(content) {
    var d = planWizard.data;
    var step = planWizard.step;

    if (step === 1) {
      buildWizardHeader(content, "When does your day start today?");
      var t1 = document.createElement("input"); t1.type = "time"; t1.className = "text-input"; t1.value = d.dayStart || "06:00";
      content.appendChild(t1);
      var nowBtn = document.createElement("button"); nowBtn.className = "btn btn-outline btn-full"; nowBtn.textContent = "Starting now";
      nowBtn.addEventListener("click", function () {
        var now = new Date();
        d.dayStart = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
        planWizardNext();
      });
      content.appendChild(nowBtn);
      var next1 = document.createElement("button"); next1.className = "btn btn-primary btn-full"; next1.textContent = "Next";
      next1.addEventListener("click", function () { d.dayStart = t1.value || "06:00"; planWizardNext(); });
      content.appendChild(next1);

    } else if (step === 2) {
      buildWizardHeader(content, "When do you want your day to finish?");
      var t2 = document.createElement("input"); t2.type = "time"; t2.className = "text-input"; t2.value = d.dayEnd || "23:00";
      content.appendChild(t2);
      var next2 = document.createElement("button"); next2.className = "btn btn-primary btn-full"; next2.textContent = "Next";
      next2.addEventListener("click", function () { d.dayEnd = t2.value || "23:00"; planWizardNext(); });
      content.appendChild(next2);

    } else if (step === 3) {
      buildWizardHeader(content, "What things already have fixed times today?");
      var sub3 = document.createElement("p"); sub3.className = "muted-line"; sub3.textContent = "Add as many as you need — or none at all.";
      content.appendChild(sub3);
      buildActivityList(content, d.fixedActivities, function (a) { return a.startTime + (a.endTime ? " to " + a.endTime : ""); });
      buildActivityAddRow(content, d.fixedActivities, {
        namePlaceholder: "e.g. Class, Work, Appointment...",
        buildExtra: function (c) {
          var row = document.createElement("div"); row.className = "plan-form-row";
          var s = document.createElement("input"); s.type = "time"; s.className = "text-input";
          var e = document.createElement("input"); e.type = "time"; e.className = "text-input";
          row.appendChild(s); row.appendChild(e); c.appendChild(row);
          return { s: s, e: e };
        },
        makeEntry: function (name, ex) {
          if (!ex.s.value) { showToast("Enter a start time"); return false; }
          return { id: uid("plan"), name: name, mode: "fixed", status: "pending", category: "dunya", startTime: ex.s.value, endTime: ex.e.value || null, prepMinutes: 0, travelBeforeMinutes: 0, travelAfterMinutes: 0 };
        },
        addLabel: "Add fixed activity"
      });
      var next3 = document.createElement("button"); next3.className = "btn btn-primary btn-full"; next3.style.marginTop = "10px"; next3.textContent = "Next";
      next3.addEventListener("click", planWizardNext);
      content.appendChild(next3);

    } else if (step === 4) {
      buildWizardHeader(content, "Do any of these need preparation or travel time?");
      if (!d.fixedActivities.length) {
        var noneMsg = document.createElement("p"); noneMsg.className = "muted-line"; noneMsg.textContent = "No fixed activities yet — nothing to add prep/travel time to.";
        content.appendChild(noneMsg);
      }
      d.fixedActivities.forEach(function (a) {
        var box = document.createElement("div"); box.className = "duniya-goal-item"; box.style.flexDirection = "column"; box.style.alignItems = "stretch";
        var name = document.createElement("p"); name.className = "name"; name.style.marginBottom = "6px"; name.textContent = a.name + " (starts " + a.startTime + ")";
        box.appendChild(name);
        var row = document.createElement("div"); row.className = "plan-form-row";
        [["Prep", "prepMinutes"], ["Travel before", "travelBeforeMinutes"], ["Travel after", "travelAfterMinutes"]].forEach(function (f) {
          var wrap = document.createElement("div"); wrap.style.flex = "1";
          wrap.innerHTML = '<p class="plan-form-label">' + f[0] + '</p>';
          var input = document.createElement("input"); input.type = "number"; input.className = "text-input"; input.placeholder = "min"; input.value = a[f[1]] || "";
          input.addEventListener("change", function () { a[f[1]] = Number(input.value) || 0; });
          wrap.appendChild(input);
          row.appendChild(wrap);
        });
        box.appendChild(row);
        content.appendChild(box);
      });
      var next4 = document.createElement("button"); next4.className = "btn btn-primary btn-full"; next4.style.marginTop = "10px"; next4.textContent = "Next";
      next4.addEventListener("click", planWizardNext);
      content.appendChild(next4);

    } else if (step === 5) {
      buildWizardHeader(content, "What else would you like to get done today?");
      var sub5 = document.createElement("p"); sub5.className = "muted-line"; sub5.textContent = "These are flexible — NURA fits them into the gaps in your day.";
      content.appendChild(sub5);
      buildActivityList(content, d.flexibleActivities, function (a) { return a.durationMinutes + " min · " + a.priority + " priority"; });
      buildActivityAddRow(content, d.flexibleActivities, {
        namePlaceholder: "e.g. Study, Workout, Reading...",
        buildExtra: function (c) {
          var row = document.createElement("div"); row.className = "plan-form-row";
          var dur = document.createElement("input"); dur.type = "number"; dur.className = "text-input"; dur.placeholder = "Duration (min)";
          row.appendChild(dur); c.appendChild(row);
          return { dur: dur };
        },
        makeEntry: function (name, ex) {
          return { id: uid("plan"), name: name, mode: "flexible", status: "pending", category: "dunya", durationMinutes: Number(ex.dur.value) || 30, priority: "medium" };
        },
        addLabel: "Add activity"
      });
      var next5 = document.createElement("button"); next5.className = "btn btn-primary btn-full"; next5.style.marginTop = "10px"; next5.textContent = "Next";
      next5.addEventListener("click", planWizardNext);
      content.appendChild(next5);

    } else if (step === 6) {
      buildWizardHeader(content, "What matters most today?");
      var all6 = planWizardAllActivities();
      if (!all6.length) {
        var noAct = document.createElement("p"); noAct.className = "muted-line"; noAct.textContent = "Add some activities in the earlier questions first, or skip this.";
        content.appendChild(noAct);
      } else {
        var sub6 = document.createElement("p"); sub6.className = "muted-line"; sub6.textContent = "Pick up to 3 priorities from what you entered.";
        content.appendChild(sub6);
        var grid6 = document.createElement("div"); grid6.className = "preset-plan-grid";
        all6.forEach(function (a) {
          var chip = document.createElement("button"); chip.type = "button"; chip.className = "preset-plan-chip" + (d.priorities.top3.indexOf(a.id) !== -1 ? " active-chip" : "");
          chip.textContent = a.name;
          chip.addEventListener("click", function () {
            var idx = d.priorities.top3.indexOf(a.id);
            if (idx !== -1) d.priorities.top3.splice(idx, 1);
            else if (d.priorities.top3.length < 3) d.priorities.top3.push(a.id);
            else { showToast("Only 3 priorities — remove one first"); return; }
            renderDuniyaPlan();
          });
          grid6.appendChild(chip);
        });
        content.appendChild(grid6);

        var mustLabel = document.createElement("p"); mustLabel.className = "plan-form-label"; mustLabel.style.marginTop = "14px"; mustLabel.textContent = "The ONE thing you especially don't want to miss:";
        content.appendChild(mustLabel);
        var mustSelect = document.createElement("select"); mustSelect.className = "text-input";
        var noneOpt = document.createElement("option"); noneOpt.value = ""; noneOpt.textContent = "— none —"; mustSelect.appendChild(noneOpt);
        all6.forEach(function (a) { var o = document.createElement("option"); o.value = a.id; o.textContent = a.name; if (d.priorities.mustNotMiss === a.id) o.selected = true; mustSelect.appendChild(o); });
        mustSelect.addEventListener("change", function () { d.priorities.mustNotMiss = mustSelect.value || null; });
        content.appendChild(mustSelect);
      }
      var next6 = document.createElement("button"); next6.className = "btn btn-primary btn-full"; next6.style.marginTop = "14px"; next6.textContent = "Next";
      next6.addEventListener("click", planWizardNext);
      content.appendChild(next6);

    } else if (step === 7) {
      buildWizardHeader(content, "What time do you need for normal life today?");
      var sub7 = document.createElement("p"); sub7.className = "muted-line"; sub7.textContent = "Meals, rest, family time — NURA protects these first.";
      content.appendChild(sub7);
      buildActivityList(content, d.personalActivities, function (a) { return a.durationMinutes + " min"; });
      var quickGrid = document.createElement("div"); quickGrid.className = "preset-plan-grid";
      [["Breakfast", 20], ["Lunch", 30], ["Dinner", 30], ["Shower", 15], ["Rest", 30], ["Family time", 45], ["Personal time", 30]].forEach(function (q) {
        var chip = document.createElement("button"); chip.type = "button"; chip.className = "preset-plan-chip"; chip.textContent = q[0];
        chip.addEventListener("click", function () {
          d.personalActivities.push({ id: uid("plan"), name: q[0], mode: "flexible", status: "pending", category: "dunya", durationMinutes: q[1], priority: "high", isPersonal: true });
          renderDuniyaPlan();
        });
        quickGrid.appendChild(chip);
      });
      content.appendChild(quickGrid);
      buildActivityAddRow(content, d.personalActivities, {
        namePlaceholder: "Something else...",
        buildExtra: function (c) {
          var dur = document.createElement("input"); dur.type = "number"; dur.className = "text-input"; dur.placeholder = "Duration (min)"; c.appendChild(dur);
          return { dur: dur };
        },
        makeEntry: function (name, ex) {
          return { id: uid("plan"), name: name, mode: "flexible", status: "pending", category: "dunya", durationMinutes: Number(ex.dur.value) || 20, priority: "high", isPersonal: true };
        },
        addLabel: "Add"
      });
      var next7 = document.createElement("button"); next7.className = "btn btn-primary btn-full"; next7.style.marginTop = "10px"; next7.textContent = "Next";
      next7.addEventListener("click", planWizardNext);
      content.appendChild(next7);

    } else if (step === 8) {
      buildWizardHeader(content, "How much breathing space do you want in your day?");
      var opts8 = [["tight", "Very tight"], ["normal", "Normal"], ["relaxed", "Relaxed"]];
      opts8.forEach(function (o) {
        var chip = document.createElement("button"); chip.type = "button"; chip.className = "preset-plan-chip" + (d.bufferStyle === o[0] ? " active-chip" : ""); chip.style.display = "block"; chip.style.width = "100%"; chip.style.marginBottom = "8px"; chip.textContent = o[1];
        chip.addEventListener("click", function () { d.bufferStyle = o[0]; renderDuniyaPlan(); });
        content.appendChild(chip);
      });
      var next8 = document.createElement("button"); next8.className = "btn btn-primary btn-full"; next8.style.marginTop = "10px"; next8.textContent = "Next";
      next8.addEventListener("click", planWizardNext);
      content.appendChild(next8);

    } else if (step === 9) {
      buildWizardHeader(content, "Does anything need to happen before or after something else?");
      var sub9 = document.createElement("p"); sub9.className = "muted-line"; sub9.textContent = "Optional — skip if not needed.";
      content.appendChild(sub9);
      var all9 = planWizardAllActivities();
      if (d.orderRules.length) {
        d.orderRules.forEach(function (r, i) {
          var a = all9.find(function (x) { return x.id === r.firstId; });
          var b = all9.find(function (x) { return x.id === r.secondId; });
          var row = document.createElement("div"); row.className = "duniya-goal-item";
          var info = document.createElement("span"); info.className = "name"; info.textContent = (a ? a.name : "?") + " before " + (b ? b.name : "?");
          var del = document.createElement("button"); del.className = "action-btn warn"; del.textContent = "Remove";
          del.addEventListener("click", function () { d.orderRules.splice(i, 1); renderDuniyaPlan(); });
          row.appendChild(info); row.appendChild(del);
          content.appendChild(row);
        });
      }
      if (all9.length >= 2) {
        var ruleRow = document.createElement("div"); ruleRow.className = "plan-form-row";
        var firstSel = document.createElement("select"); firstSel.className = "text-input";
        var secondSel = document.createElement("select"); secondSel.className = "text-input";
        all9.forEach(function (a) {
          var o1 = document.createElement("option"); o1.value = a.id; o1.textContent = a.name; firstSel.appendChild(o1);
          var o2 = document.createElement("option"); o2.value = a.id; o2.textContent = a.name; secondSel.appendChild(o2);
        });
        ruleRow.appendChild(firstSel); ruleRow.appendChild(secondSel);
        content.appendChild(ruleRow);
        var addRuleBtn = document.createElement("button"); addRuleBtn.className = "btn btn-outline btn-full"; addRuleBtn.textContent = "Add: first before second";
        addRuleBtn.addEventListener("click", function () {
          if (firstSel.value === secondSel.value) { showToast("Pick two different activities"); return; }
          d.orderRules.push({ firstId: firstSel.value, secondId: secondSel.value });
          renderDuniyaPlan();
        });
        content.appendChild(addRuleBtn);
      }
      var next9 = document.createElement("button"); next9.className = "btn btn-primary btn-full"; next9.style.marginTop = "10px"; next9.textContent = "Next";
      next9.addEventListener("click", planWizardNext);
      content.appendChild(next9);

    } else if (step === 10) {
      buildWizardHeader(content, "Anything else NURA should know about today?");
      var sub10 = document.createElement("p"); sub10.className = "muted-line"; sub10.textContent = "Optional. E.g. “nothing after 9 PM” or “I'm tired today.”";
      content.appendChild(sub10);
      var noteInput = document.createElement("textarea"); noteInput.className = "text-input reflection-textarea"; noteInput.rows = 3; noteInput.value = d.note;
      content.appendChild(noteInput);

      var sunnahTitle = document.createElement("p"); sunnahTitle.className = "picker-step-title"; sunnahTitle.style.marginTop = "14px"; sunnahTitle.textContent = "Include Sunnah habits";
      content.appendChild(sunnahTitle);
      PLAN_SUNNAH_ITEMS.forEach(function (s) {
        var label = document.createElement("label"); label.className = "checklist-item";
        var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!d.sunnahEnabled[s.key];
        cb.addEventListener("change", function () { d.sunnahEnabled[s.key] = cb.checked; });
        var span = document.createElement("span"); span.textContent = s.label;
        label.appendChild(cb); label.appendChild(span);
        content.appendChild(label);
      });

      var createBtn = document.createElement("button"); createBtn.className = "btn btn-primary btn-full"; createBtn.style.marginTop = "16px"; createBtn.textContent = "Create Today's Plan";
      createBtn.addEventListener("click", function () {
        d.note = noteInput.value.trim();
        finishPlanWizard();
      });
      content.appendChild(createBtn);
    }
  }

  function applyPlanNoteRules(d) {
    var note = (d.note || "").toLowerCase();
    var m = note.match(/nothing (scheduled )?after (\d{1,2})\s*(am|pm)/);
    if (m) {
      var hour = Number(m[2]) % 12 + (m[3] === "pm" ? 12 : 0);
      var proposed = String(hour).padStart(2, "0") + ":00";
      if (planTimeToMinutes(proposed) < planTimeToMinutes(d.dayEnd)) d.dayEnd = proposed;
    }
    if (/tired/.test(note) && d.bufferStyle === "tight") d.bufferStyle = "normal";
    var evening = note.match(/(\d+)\s*hour.*evening|evening.*free/);
    if (evening) {
      var hrs = Number(evening[1]) || 1;
      d.personalActivities.push({ id: uid("plan"), name: "Reserved evening free time", mode: "flexible", status: "pending", category: "dunya", durationMinutes: hrs * 60, priority: "high", isPersonal: true, eveningReserved: true });
    }
  }

  function finishPlanWizard() {
    var d = planWizard.data;
    applyPlanNoteRules(d);
    var activities = planWizardAllActivities();
    savePlanActivities(activities);
    writeJSON("nc_plan_sunnah_defaults", d.sunnahEnabled);
    var settings = {
      dayStart: d.dayStart || "06:00", dayEnd: d.dayEnd || "23:00",
      sunnahEnabled: d.sunnahEnabled, bufferStyle: d.bufferStyle,
      priorities: d.priorities, orderRules: d.orderRules, note: d.note
    };
    savePlanSettings(settings);
    planWizard = null;
    runBuildMyDay();
  }

  function renderPlanEntryScreen(content) {
    var h2 = document.createElement("h2");
    h2.textContent = "Plan My Day";
    content.appendChild(h2);
    var sub = document.createElement("p");
    sub.className = "muted-line";
    sub.style.marginBottom = "16px";
    sub.textContent = "Tell NURA what your day looks like. We'll help you organize it.";
    content.appendChild(sub);

    var existing = getPlanActivities();
    if (existing.length) {
      var existingNote = document.createElement("p");
      existingNote.className = "muted-line";
      existingNote.style.marginBottom = "12px";
      existingNote.textContent = "You already have " + existing.length + " activit" + (existing.length === 1 ? "y" : "ies") + " planned for today.";
      content.appendChild(existingNote);
      var editBtn = document.createElement("button");
      editBtn.className = "btn btn-outline btn-full";
      editBtn.textContent = "Edit Plan";
      editBtn.addEventListener("click", function () {
        planWizard = { step: 3, data: {
          dayStart: getPlanSettings().dayStart, dayEnd: getPlanSettings().dayEnd,
          fixedActivities: existing.filter(function (a) { return a.mode === "fixed"; }),
          flexibleActivities: existing.filter(function (a) { return a.mode === "flexible" && !a.isPersonal; }),
          personalActivities: existing.filter(function (a) { return a.isPersonal; }),
          priorities: getPlanSettings().priorities, bufferStyle: getPlanSettings().bufferStyle,
          orderRules: getPlanSettings().orderRules, note: getPlanSettings().note,
          sunnahEnabled: getPlanSettings().sunnahEnabled
        } };
        renderDuniyaPlan();
      });
      content.appendChild(editBtn);
      var rebuildBtn = document.createElement("button");
      rebuildBtn.className = "btn btn-outline btn-full";
      rebuildBtn.textContent = "Rebuild Plan";
      rebuildBtn.addEventListener("click", runBuildMyDay);
      content.appendChild(rebuildBtn);
      var startFreshBtn = document.createElement("button");
      startFreshBtn.className = "priority-change-link";
      startFreshBtn.textContent = "Start a completely new plan";
      startFreshBtn.addEventListener("click", function () {
        savePlanActivities([]);
        startPlanWizard();
      });
      content.appendChild(startFreshBtn);
      return;
    }

    var createBtn = document.createElement("button");
    createBtn.className = "btn btn-primary btn-full";
    createBtn.textContent = "Create Today's Plan";
    createBtn.addEventListener("click", startPlanWizard);
    content.appendChild(createBtn);
  }

  function renderDuniyaPlan() {
    var content = document.getElementById("duniya-plan-content");
    content.innerHTML = "";
    var built = getPlanBuilt();
    if (planWizard) renderWizardStep(content);
    else if (built) renderPlanTimelineView(content, built);
    else renderPlanEntryScreen(content);
  }

  function initDuniyaPlan() {
    document.getElementById("duniya-plan-back").addEventListener("click", function () {
      planWizard = null;
      setActiveView("duniya");
    });
  }

  // ---------- INIT ----------

  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initNameModal();
    initPriorityUI();
    initFocusTimer();
    initSunnahSubtabs();
    initDuasUI();
    initHadithUI();
    initQuranUI();
    initVault();
    initShield();
    initMore();
    initDuniyaHabits();
    initDuniyaProductivity();
    initDuniyaWellbeing();
    initDuniyaCareer();
    initDuniyaMoney();
    initPhoneGuard();
    initRecovery();
    initDuniyaGrowth();
    initDuniyaPlan();
    renderHome();
    renderMore();
  });
})();
