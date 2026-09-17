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
    document.querySelectorAll(".nav-btn[data-nav]").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.nav === name);
    });
    if (name === "home") renderHome();
    if (name === "sunnah") { renderRoutine(); renderAkhlaq(); renderVerseOfDay(); renderHadithList(); renderDuaCategories(); }
    if (name === "chat") renderChatOptions();
    if (name === "vault") renderVaultRoot();
    if (name === "more") renderMore();
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
    renderHome();
    renderMore();
  });
})();
