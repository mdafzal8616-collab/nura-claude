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
  // QUESTION -> ACTION -> MONEY SAVED -> TRACK IT -> SEE PROGRESS.
  // Every number shown must come from something the user actually logged —
  // never fabricated. See docs/decisions.md for the full rebuild notes.

  var MONEY_HABIT_CATEGORIES = [
    "Smoking", "Tobacco", "Alcohol", "Recreational drugs", "Junk food",
    "Soft drinks", "Tea/Coffee", "Food delivery", "Gaming purchases",
    "Shopping", "Subscriptions", "Online impulse purchases",
    "Transport waste", "Betting/gambling expenses tracking only", "Other / Custom"
  ];
  var MONEY_GOAL_PRESETS = [
    "Emergency fund", "Phone", "Laptop", "Course", "Gym membership", "Travel", "Family", "Business"
  ];

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

  // -- data accessors --
  function getMoneyGoals() { return readJSON("nc_money_goals", []); }
  function saveMoneyGoals(arr) { writeJSON("nc_money_goals", arr); }
  function getActiveGoalId() { return readJSON("nc_money_active_goal_id", null); }
  function setActiveGoalId(id) { writeJSON("nc_money_active_goal_id", id); }
  function getActiveGoal() {
    var id = getActiveGoalId();
    if (!id) return null;
    return getMoneyGoals().find(function (g) { return g.id === id; }) || null;
  }
  function markGoalCelebrationSeen(goalId) {
    var goals = getMoneyGoals();
    var g = goals.find(function (x) { return x.id === goalId; });
    if (g) g.celebrationSeen = true;
    saveMoneyGoals(goals);
  }
  function createMoneyGoal(name, targetAmount) {
    var goals = getMoneyGoals();
    var goal = { id: uid("goal"), name: name, targetAmount: targetAmount, currentSavedAmount: 0, createdAt: new Date().toISOString(), completedAt: null, celebrationSeen: false };
    goals.push(goal);
    saveMoneyGoals(goals);
    setActiveGoalId(goal.id);
    return goal;
  }
  function addToGoal(goalId, amount) {
    if (!goalId || goalId === "general" || !amount || amount <= 0) return null;
    var goals = getMoneyGoals();
    var goal = goals.find(function (g) { return g.id === goalId; });
    if (!goal || goal.completedAt) return null;
    goal.currentSavedAmount = (goal.currentSavedAmount || 0) + amount;
    var justCompleted = false;
    if (goal.currentSavedAmount >= goal.targetAmount) {
      goal.currentSavedAmount = goal.targetAmount;
      goal.completedAt = new Date().toISOString();
      justCompleted = true;
    }
    saveMoneyGoals(goals);
    return { goal: goal, justCompleted: justCompleted };
  }
  // Undoes a prior addToGoal — used when a check-in that already moved
  // money into a goal gets edited, so the goal never silently keeps money
  // its own daily log no longer accounts for.
  function reverseFromGoal(goalId, amount) {
    if (!goalId || goalId === "general" || !amount) return;
    var goals = getMoneyGoals();
    var goal = goals.find(function (g) { return g.id === goalId; });
    if (!goal) return;
    goal.currentSavedAmount = Math.max(0, (goal.currentSavedAmount || 0) - amount);
    if (goal.completedAt && goal.currentSavedAmount < goal.targetAmount) goal.completedAt = null;
    saveMoneyGoals(goals);
  }

  function getMoneyHabits() { return readJSON("nc_money_habits", []); }
  function saveMoneyHabits(arr) { writeJSON("nc_money_habits", arr); }
  function moneyHabitCosts(habit) {
    var daily = habit.normalDailyQuantity * habit.costPerUnit;
    return { daily: daily, weekly: daily * 7, monthly: daily * 30, yearly: daily * 365 };
  }

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

  // Sums real logged savings in [fromDateKey, toDateKey] (either bound may be
  // null for unbounded), optionally restricted to a single goal's money.
  // This is the one place "money saved" is computed — never guessed.
  function computeMoneySaved(fromDateKey, toDateKey, goalIdFilter) {
    var total = 0, fromHabits = 0, fromPurchases = 0, fromDecisions = 0;
    function inRange(dateKey) {
      if (fromDateKey && dateKey < fromDateKey) return false;
      if (toDateKey && dateKey > toDateKey) return false;
      return true;
    }
    var logs = getMoneyDailyLogs();
    Object.keys(logs).forEach(function (dateKey) {
      if (!inRange(dateKey)) return;
      var dayLogs = logs[dateKey];
      Object.keys(dayLogs).forEach(function (habitId) {
        var e = dayLogs[habitId];
        if (!e || !e.amountAvoided) return;
        if (goalIdFilter && e.destination !== goalIdFilter) return;
        total += e.amountAvoided;
        fromHabits += e.amountAvoided;
      });
    });
    getAvoidedPurchases().forEach(function (p) {
      if (!inRange(p.date)) return;
      if (goalIdFilter && p.destination !== goalIdFilter) return;
      total += p.amount;
      fromPurchases += p.amount;
    });
    getPurchaseDecisions().forEach(function (d) {
      if (d.decision !== "avoided" || !d.moneyAvoided) return;
      var dk = d.decidedAt ? todayKey(new Date(d.decidedAt)) : null;
      if (!dk || !inRange(dk)) return;
      if (goalIdFilter && d.destination !== goalIdFilter) return;
      total += d.moneyAvoided;
      fromDecisions += d.moneyAvoided;
    });
    return { total: total, fromHabits: fromHabits, fromPurchases: fromPurchases, fromDecisions: fromDecisions };
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
      return { dateKey: dateKey, amount: computeMoneySaved(dateKey, dateKey, null).total };
    });
    var anyData = dayTotals.some(function (d) { return d.amount > 0; });
    if (!anyData) {
      var empty = document.createElement("p");
      empty.className = "progress-graph-empty";
      empty.textContent = "Log a saving to start your weekly graph.";
      wrap.appendChild(empty);
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
    var card = document.createElement("div");
    card.className = "money-habit-card";
    var displayName = (habit.customName || habit.category) + (habit.privacyEnabled ? " 🔒" : "");
    var nameEl = document.createElement("p");
    nameEl.className = "name";
    nameEl.textContent = displayName;
    card.appendChild(nameEl);

    var costs = moneyHabitCosts(habit);
    var costLine = document.createElement("p");
    costLine.className = "cost-line";
    costLine.textContent = fmtRupee(costs.daily) + "/day if unchanged · usual " + habit.normalDailyQuantity + "/day";
    card.appendChild(costLine);

    var todayEntry = getDailyLogEntry(habit.id, todayKey());
    var statusLine = document.createElement("p");
    statusLine.className = "cost-line";
    if (todayEntry) {
      statusLine.textContent = todayEntry.amountAvoided > 0 ? "Today: saved " + fmtRupee(todayEntry.amountAvoided) : "Today: no saving recorded";
      statusLine.style.color = todayEntry.amountAvoided > 0 ? "var(--mint)" : "var(--muted)";
    } else {
      statusLine.textContent = "Not checked in today";
    }
    card.appendChild(statusLine);

    var actionsRow = document.createElement("div");
    actionsRow.className = "money-quick-actions";
    var checkinBtn = document.createElement("button");
    checkinBtn.className = "action-btn primary";
    checkinBtn.textContent = todayEntry ? "Update Check-in" : "Check In";
    checkinBtn.addEventListener("click", function () {
      var existing = getDailyLogEntry(habit.id, todayKey());
      goMoneyScreen("habit-checkin", {
        habitId: habit.id,
        reduceBy: existing && existing.targetQuantity !== null && existing.targetQuantity !== undefined ? (existing.normalQuantity - existing.targetQuantity) : null,
        actualQuantity: existing ? existing.actualQuantity : null,
        phase: "input"
      });
    });
    actionsRow.appendChild(checkinBtn);
    var editBtn = document.createElement("button");
    editBtn.className = "action-btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function () {
      goMoneyScreen("habit-setup", {
        step: 1, editHabitId: habit.id,
        data: { category: habit.category, customName: habit.customName, privacyEnabled: habit.privacyEnabled, normalDailyQuantity: habit.normalDailyQuantity, costPerUnit: habit.costPerUnit }
      });
    });
    actionsRow.appendChild(editBtn);
    card.appendChild(actionsRow);
    return card;
  }

  function handleWaitingDecision(decisionId, stillWant) {
    var decisions = getPurchaseDecisions();
    var d = decisions.find(function (x) { return x.id === decisionId; });
    if (!d) return;
    if (stillWant) {
      d.decision = "bought";
      d.moneyAvoided = 0;
      d.decidedAt = new Date().toISOString();
      savePurchaseDecisions(decisions);
      showToast("Noted");
      renderDuniyaMoney();
    } else {
      d.decision = "avoided";
      d.moneyAvoided = d.amount;
      d.decidedAt = new Date().toISOString();
      savePurchaseDecisions(decisions);
      goMoneyScreen("should-i-buy-result", { decisionId: decisionId });
    }
  }

  function renderMoneyDashboard(content) {
    var waitingReady = getPurchaseDecisions().filter(function (d) { return d.decision === "waiting" && d.decideAfter && Date.now() >= d.decideAfter; });
    waitingReady.forEach(function (d) {
      var banner = document.createElement("div");
      banner.className = "money-wait-banner";
      var q = document.createElement("p");
      q.style.margin = "0 0 8px";
      q.textContent = "Do you still want: " + d.itemName + " (" + fmtRupee(d.amount) + ")?";
      banner.appendChild(q);
      var row = document.createElement("div");
      row.className = "money-quick-actions";
      row.style.margin = "0";
      var yesBtn = document.createElement("button");
      yesBtn.className = "action-btn";
      yesBtn.textContent = "Yes, still want it";
      yesBtn.addEventListener("click", function () { handleWaitingDecision(d.id, true); });
      row.appendChild(yesBtn);
      var noBtn = document.createElement("button");
      noBtn.className = "action-btn primary";
      noBtn.textContent = "No, skip it";
      noBtn.addEventListener("click", function () { handleWaitingDecision(d.id, false); });
      row.appendChild(noBtn);
      banner.appendChild(row);
      content.appendChild(banner);
    });

    // My Saving Goal
    var goal = getActiveGoal();
    var goalSection = document.createElement("div");
    goalSection.className = "money-goal-block";
    var goalTitle = document.createElement("h2");
    goalTitle.textContent = "My Saving Goal";
    goalSection.appendChild(goalTitle);

    if (!goal) {
      var noGoalP = document.createElement("p");
      noGoalP.className = "muted-line";
      noGoalP.textContent = "You haven't set a saving goal yet.";
      goalSection.appendChild(noGoalP);
      var createGoalBtn = document.createElement("button");
      createGoalBtn.className = "btn btn-primary btn-full";
      createGoalBtn.textContent = "Create a Saving Goal";
      createGoalBtn.addEventListener("click", function () { goMoneyScreen("new-goal"); });
      goalSection.appendChild(createGoalBtn);
    } else {
      var nameP = document.createElement("p");
      nameP.className = "money-goal-name";
      nameP.textContent = goal.name;
      goalSection.appendChild(nameP);
      var amountP = document.createElement("p");
      amountP.className = "money-goal-amount";
      amountP.textContent = fmtRupee(goal.currentSavedAmount) + " / " + fmtRupee(goal.targetAmount);
      goalSection.appendChild(amountP);
      var track = document.createElement("div");
      track.className = "plan-progress-track";
      var fill = document.createElement("div");
      fill.className = "plan-progress-fill";
      var pct = goal.targetAmount ? Math.min(100, Math.round((goal.currentSavedAmount / goal.targetAmount) * 100)) : 0;
      fill.style.width = pct + "%";
      track.appendChild(fill);
      goalSection.appendChild(track);
      var metaP = document.createElement("p");
      metaP.className = "muted-line";
      metaP.textContent = pct + "% completed · " + fmtRupee(Math.max(0, goal.targetAmount - goal.currentSavedAmount)) + " remaining";
      goalSection.appendChild(metaP);
      if (goal.completedAt) {
        var doneP = document.createElement("p");
        doneP.className = "money-goal-name";
        doneP.style.color = "var(--mint)";
        doneP.textContent = "🎉 Goal completed";
        goalSection.appendChild(doneP);
      }
      var changeGoalLink = document.createElement("button");
      changeGoalLink.className = "priority-change-link";
      changeGoalLink.textContent = goal.completedAt ? "Start a new goal" : "Change goal";
      changeGoalLink.addEventListener("click", function () { goMoneyScreen("new-goal"); });
      goalSection.appendChild(changeGoalLink);
    }
    content.appendChild(goalSection);

    // Money Saved Today / This Week / This Month
    var today = todayKey();
    var weekStart = getLastNDateKeys(7).slice(-1)[0];
    var monthStart = getLastNDateKeys(30).slice(-1)[0];
    var savedToday = computeMoneySaved(today, null, null).total;
    var savedWeek = computeMoneySaved(weekStart, null, null).total;
    var savedMonth = computeMoneySaved(monthStart, null, null).total;
    var allTime = computeMoneySaved(null, null, null).total;

    var statGrid = document.createElement("div");
    statGrid.className = "money-stat-grid";
    [["Today", savedToday], ["This Week", savedWeek], ["This Month", savedMonth]].forEach(function (pair) {
      var tile = document.createElement("div");
      tile.className = "money-stat-tile";
      var big = document.createElement("span");
      big.className = "big";
      big.textContent = fmtRupee(pair[1]);
      var lbl = document.createElement("span");
      lbl.className = "lbl";
      lbl.textContent = pair[0];
      tile.appendChild(big);
      tile.appendChild(lbl);
      statGrid.appendChild(tile);
    });
    content.appendChild(statGrid);

    // Money I Avoided Wasting (all-time)
    var avoidedTotalP = document.createElement("p");
    avoidedTotalP.className = "money-avoided-total";
    var strongAmt = document.createElement("strong");
    strongAmt.textContent = fmtRupee(allTime);
    avoidedTotalP.appendChild(strongAmt);
    avoidedTotalP.appendChild(document.createTextNode(" money I avoided wasting — all time"));
    content.appendChild(avoidedTotalP);

    // My Money Habits
    var habitsHeader = document.createElement("h2");
    habitsHeader.style.marginTop = "18px";
    habitsHeader.textContent = "My Money Habits";
    content.appendChild(habitsHeader);

    var habits = getMoneyHabits().filter(function (h) { return !h.archived; });
    if (!habits.length) {
      var noHabitsP = document.createElement("p");
      noHabitsP.className = "muted-line";
      noHabitsP.textContent = "Track a spending habit to see its real cost and reduce it.";
      content.appendChild(noHabitsP);
    } else {
      habits.forEach(function (habit) { content.appendChild(renderMoneyHabitCard(habit)); });
    }
    var addHabitBtn = document.createElement("button");
    addHabitBtn.className = "btn btn-outline btn-full";
    addHabitBtn.textContent = "+ Track a money habit";
    addHabitBtn.addEventListener("click", function () {
      goMoneyScreen("habit-setup", { step: 1, data: { category: null, customName: "", privacyEnabled: false, normalDailyQuantity: null, costPerUnit: null } });
    });
    content.appendChild(addHabitBtn);

    // Weekly Progress
    var weekHeader = document.createElement("h2");
    weekHeader.style.marginTop = "18px";
    weekHeader.textContent = "Weekly Progress";
    content.appendChild(weekHeader);
    content.appendChild(renderMoneyWeekGraph());
    var viewReportBtn = document.createElement("button");
    viewReportBtn.className = "priority-change-link";
    viewReportBtn.textContent = "View full weekly report";
    viewReportBtn.addEventListener("click", function () { goMoneyScreen("weekly-report"); });
    content.appendChild(viewReportBtn);

    // Quick Actions
    var quickHeader = document.createElement("h2");
    quickHeader.style.marginTop = "18px";
    quickHeader.textContent = "Quick Actions";
    content.appendChild(quickHeader);
    var quickGrid = document.createElement("div");
    quickGrid.className = "money-quick-actions";
    var avoidBtn = document.createElement("button");
    avoidBtn.className = "preset-plan-chip";
    avoidBtn.textContent = "+ I avoided a purchase";
    avoidBtn.addEventListener("click", function () { goMoneyScreen("avoided-purchase", { itemName: "", amount: "" }); });
    quickGrid.appendChild(avoidBtn);
    var shouldIBuyBtn = document.createElement("button");
    shouldIBuyBtn.className = "preset-plan-chip";
    shouldIBuyBtn.textContent = "Should I buy this?";
    shouldIBuyBtn.addEventListener("click", function () { goMoneyScreen("should-i-buy", { phase: "entry" }); });
    quickGrid.appendChild(shouldIBuyBtn);
    content.appendChild(quickGrid);
  }

  // -- New Goal --

  function renderMoneyNewGoal(content) {
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });
    var h2 = document.createElement("h2");
    h2.textContent = "What are you saving for?";
    content.appendChild(h2);

    var chipsWrap = document.createElement("div");
    chipsWrap.className = "money-quick-actions";
    var chosenName = moneyView.goalName || "";
    MONEY_GOAL_PRESETS.forEach(function (preset) {
      var chip = document.createElement("button");
      chip.className = "preset-plan-chip" + (chosenName === preset ? " active-chip" : "");
      chip.textContent = preset;
      chip.addEventListener("click", function () { moneyView.goalName = preset; renderDuniyaMoney(); });
      chipsWrap.appendChild(chip);
    });
    content.appendChild(chipsWrap);

    var customLabel = document.createElement("p");
    customLabel.className = "muted-line";
    customLabel.style.marginTop = "12px";
    customLabel.textContent = "Or name your own goal";
    content.appendChild(customLabel);
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "text-input";
    nameInput.placeholder = "e.g. New phone";
    nameInput.value = MONEY_GOAL_PRESETS.indexOf(chosenName) === -1 ? chosenName : "";
    nameInput.addEventListener("input", function () { moneyView.goalName = nameInput.value; });
    content.appendChild(nameInput);

    var amountLabel = document.createElement("p");
    amountLabel.className = "muted-line";
    amountLabel.style.marginTop = "12px";
    amountLabel.textContent = "Target amount";
    content.appendChild(amountLabel);
    var amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.min = "1";
    amountInput.className = "text-input";
    amountInput.placeholder = "₹5000";
    amountInput.value = moneyView.goalAmount || "";
    amountInput.addEventListener("input", function () { moneyView.goalAmount = amountInput.value; });
    content.appendChild(amountInput);

    var saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-primary btn-full";
    saveBtn.style.marginTop = "14px";
    saveBtn.textContent = "Save Goal";
    saveBtn.addEventListener("click", function () {
      var name = (moneyView.goalName || "").trim();
      var amount = parseFloat(moneyView.goalAmount);
      if (!name) { showToast("Give your goal a name"); return; }
      if (!amount || amount <= 0) { showToast("Enter a target amount"); return; }
      createMoneyGoal(name, amount);
      showToast("Saving goal created");
      goMoneyScreen("dashboard");
    });
    content.appendChild(saveBtn);
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

  function finalizeMoneyCheckin(habitId, res, destination) {
    var dateKey = todayKey();
    var entry = getDailyLogEntry(habitId, dateKey);
    if (entry) {
      entry.destination = destination;
      saveDailyLogEntry(habitId, dateKey, entry);
    }
    if (destination !== "general") {
      var r = addToGoal(destination, res.amountAvoided);
      if (r && r.justCompleted) { goMoneyScreen("goal-completed", { goalId: destination }); return; }
    }
    showToast("Saved");
    goMoneyScreen("dashboard");
  }

  function renderMoneyHabitCheckin(content) {
    var habit = getMoneyHabits().find(function (h) { return h.id === moneyView.habitId; });
    if (!habit) { goMoneyScreen("dashboard"); return; }
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });

    var displayName = habit.customName || habit.category;
    var h2 = document.createElement("h2");
    h2.textContent = displayName + " — Check In";
    content.appendChild(h2);

    if (moneyView.phase === "result") {
      var res = moneyView.result;
      var banner = document.createElement("div");
      banner.className = "money-result-banner" + (res.amountAvoided > 0 ? "" : " neutral");
      if (res.amountAvoided > 0) {
        var amt = document.createElement("p");
        amt.className = "amount";
        amt.textContent = "You saved " + fmtRupee(res.amountAvoided) + " today";
        banner.appendChild(amt);
        if (res.targetBeaten) {
          var tb = document.createElement("p");
          tb.className = "muted-line";
          tb.textContent = "Target beaten 🎯";
          banner.appendChild(tb);
        }
      } else {
        var np = document.createElement("p");
        np.textContent = "No saving recorded today. You can try again tomorrow.";
        banner.appendChild(np);
      }
      content.appendChild(banner);

      if (res.amountAvoided > 0 && !res.destinationChosen) {
        var destRow = document.createElement("div");
        destRow.className = "money-quick-actions";
        var goal = getActiveGoal();
        if (goal && !goal.completedAt) {
          var addBtn = document.createElement("button");
          addBtn.className = "btn btn-primary btn-full";
          addBtn.textContent = "Add " + fmtRupee(res.amountAvoided) + " to Saving Goal";
          addBtn.addEventListener("click", function () { finalizeMoneyCheckin(habit.id, res, goal.id); });
          destRow.appendChild(addBtn);
        }
        var generalBtn = document.createElement("button");
        generalBtn.className = "btn btn-outline btn-full";
        generalBtn.textContent = "Keep as General Savings";
        generalBtn.addEventListener("click", function () { finalizeMoneyCheckin(habit.id, res, "general"); });
        destRow.appendChild(generalBtn);
        content.appendChild(destRow);
      } else {
        var doneBtn = document.createElement("button");
        doneBtn.className = "btn btn-primary btn-full";
        doneBtn.textContent = "Done";
        doneBtn.addEventListener("click", function () { goMoneyScreen("dashboard"); });
        content.appendChild(doneBtn);
      }
      return;
    }

    var usualP = document.createElement("p");
    usualP.className = "muted-line";
    usualP.textContent = "Usual amount: " + habit.normalDailyQuantity + "/day";
    content.appendChild(usualP);

    var targetLabel = document.createElement("p");
    targetLabel.className = "muted-line";
    targetLabel.style.marginTop = "12px";
    targetLabel.textContent = "Today I want to reduce by (optional)";
    content.appendChild(targetLabel);
    var targetChips = document.createElement("div");
    targetChips.className = "money-quick-actions";
    [1, 2, 3].forEach(function (n) {
      var chip = document.createElement("button");
      chip.className = "preset-plan-chip" + (moneyView.reduceBy === n ? " active-chip" : "");
      chip.textContent = "-" + n;
      chip.addEventListener("click", function () {
        moneyView.reduceBy = n;
        moneyView.actualQuantity = Math.max(0, habit.normalDailyQuantity - n);
        renderDuniyaMoney();
      });
      targetChips.appendChild(chip);
    });
    var skipChip = document.createElement("button");
    skipChip.className = "preset-plan-chip" + (!moneyView.reduceBy ? " active-chip" : "");
    skipChip.textContent = "No target";
    skipChip.addEventListener("click", function () { moneyView.reduceBy = null; renderDuniyaMoney(); });
    targetChips.appendChild(skipChip);
    content.appendChild(targetChips);

    var qLabel = document.createElement("p");
    qLabel.className = "muted-line";
    qLabel.style.marginTop = "14px";
    qLabel.textContent = "How many did you use/buy today?";
    content.appendChild(qLabel);
    var actualQ = (moneyView.actualQuantity !== null && moneyView.actualQuantity !== undefined) ? moneyView.actualQuantity : habit.normalDailyQuantity;
    content.appendChild(buildMoneyStepper(actualQ, function (v) { moneyView.actualQuantity = v; renderDuniyaMoney(); }, 0, 200));

    var saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-primary btn-full";
    saveBtn.style.marginTop = "14px";
    saveBtn.textContent = "Save Check-in";
    saveBtn.addEventListener("click", function () {
      var actual = actualQ;
      var normal = habit.normalDailyQuantity;
      var avoided = Math.max(0, (normal - actual) * habit.costPerUnit);
      var targetBeaten = moneyView.reduceBy ? (normal - actual) > moneyView.reduceBy : false;
      var dateKey = todayKey();
      var priorEntry = getDailyLogEntry(habit.id, dateKey);
      if (priorEntry && priorEntry.destination && priorEntry.destination !== "general") {
        reverseFromGoal(priorEntry.destination, priorEntry.amountAvoided);
      }
      saveDailyLogEntry(habit.id, dateKey, {
        habitId: habit.id, date: dateKey, normalQuantity: normal, actualQuantity: actual,
        targetQuantity: moneyView.reduceBy ? Math.max(0, normal - moneyView.reduceBy) : null,
        amountAvoided: avoided, destination: null, createdAt: new Date().toISOString()
      });
      moneyView.phase = "result";
      moneyView.result = { amountAvoided: avoided, targetBeaten: targetBeaten, destinationChosen: avoided === 0 };
      renderDuniyaMoney();
    });
    content.appendChild(saveBtn);
  }

  // -- "I avoided a purchase" --

  function finalizeAvoidedPurchase(destination) {
    var purchases = getAvoidedPurchases();
    purchases.push({
      id: uid("avoid"), itemName: moneyView.itemNameFinal, category: null,
      amount: moneyView.amountNum, date: todayKey(), destination: destination, createdAt: new Date().toISOString()
    });
    saveAvoidedPurchases(purchases);
    if (destination !== "general") {
      var r = addToGoal(destination, moneyView.amountNum);
      if (r && r.justCompleted) { goMoneyScreen("goal-completed", { goalId: destination }); return; }
    }
    showToast(fmtRupee(moneyView.amountNum) + " avoided");
    goMoneyScreen("dashboard");
  }

  function renderMoneyAvoidedPurchase(content) {
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });

    if (moneyView.phase === "result") {
      var h2r = document.createElement("h2");
      h2r.textContent = fmtRupee(moneyView.amountNum) + " avoided";
      content.appendChild(h2r);
      var whereP = document.createElement("p");
      whereP.className = "muted-line";
      whereP.textContent = "Where should this money go?";
      content.appendChild(whereP);
      var destRow = document.createElement("div");
      destRow.className = "money-quick-actions";
      var goal = getActiveGoal();
      if (goal && !goal.completedAt) {
        var addBtn = document.createElement("button");
        addBtn.className = "btn btn-primary btn-full";
        addBtn.textContent = "Saving Goal";
        addBtn.addEventListener("click", function () { finalizeAvoidedPurchase(goal.id); });
        destRow.appendChild(addBtn);
      }
      var genBtn = document.createElement("button");
      genBtn.className = "btn btn-outline btn-full";
      genBtn.textContent = "General Savings";
      genBtn.addEventListener("click", function () { finalizeAvoidedPurchase("general"); });
      destRow.appendChild(genBtn);
      content.appendChild(destRow);
      return;
    }

    var h2 = document.createElement("h2");
    h2.textContent = "What did you avoid?";
    content.appendChild(h2);
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "text-input";
    nameInput.placeholder = "e.g. Food delivery";
    nameInput.value = moneyView.itemName || "";
    nameInput.addEventListener("input", function () { moneyView.itemName = nameInput.value; });
    content.appendChild(nameInput);

    var amtLabel = document.createElement("p");
    amtLabel.className = "muted-line";
    amtLabel.style.marginTop = "12px";
    amtLabel.textContent = "How much would it have cost?";
    content.appendChild(amtLabel);
    var amtInput = document.createElement("input");
    amtInput.type = "number";
    amtInput.min = "0";
    amtInput.className = "text-input";
    amtInput.placeholder = "₹350";
    amtInput.value = moneyView.amount || "";
    amtInput.addEventListener("input", function () { moneyView.amount = amtInput.value; });
    content.appendChild(amtInput);

    var confirmBtn = document.createElement("button");
    confirmBtn.className = "btn btn-primary btn-full";
    confirmBtn.style.marginTop = "14px";
    confirmBtn.textContent = "Confirm";
    confirmBtn.addEventListener("click", function () {
      var name = (moneyView.itemName || "").trim();
      var amount = parseFloat(moneyView.amount);
      if (!name) { showToast("What did you avoid?"); return; }
      if (!amount || amount <= 0) { showToast("Enter an amount"); return; }
      moneyView.amountNum = amount;
      moneyView.itemNameFinal = name;
      moneyView.phase = "result";
      renderDuniyaMoney();
    });
    content.appendChild(confirmBtn);
  }

  // -- "Should I buy this?" --

  function validateShouldIBuyEntry() {
    var name = (moneyView.itemName || "").trim();
    var price = parseFloat(moneyView.price);
    if (!name) { showToast("Enter the item name"); return null; }
    if (!price || price <= 0) { showToast("Enter the price"); return null; }
    return { name: name, price: price };
  }

  function saveShouldIBuyWait(hours, label) {
    var decisions = getPurchaseDecisions();
    decisions.push({
      id: uid("decision"), itemName: moneyView.itemNameFinal, amount: moneyView.priceNum, needOrWant: moneyView.needOrWant,
      waitPeriod: hours, decision: "waiting", moneyAvoided: 0, destination: null, createdAt: new Date().toISOString(),
      decideAfter: Date.now() + hours * 3600000, decidedAt: null
    });
    savePurchaseDecisions(decisions);
    moneyView.phase = "done";
    moneyView.doneMessage = "We'll ask if you still want it once your " + label + " wait is up — you'll see it right here on your Money Habits home.";
    renderDuniyaMoney();
  }

  function saveShouldIBuyImmediateDecision(stillWant) {
    var decisions = getPurchaseDecisions();
    var rec = {
      id: uid("decision"), itemName: moneyView.itemNameFinal, amount: moneyView.priceNum, needOrWant: moneyView.needOrWant,
      waitPeriod: null, decision: stillWant ? "bought" : "avoided", moneyAvoided: stillWant ? 0 : moneyView.priceNum,
      destination: null, createdAt: new Date().toISOString(), decideAfter: null, decidedAt: new Date().toISOString()
    };
    decisions.push(rec);
    savePurchaseDecisions(decisions);
    if (stillWant) {
      moneyView.phase = "done";
      moneyView.doneMessage = "Noted.";
      renderDuniyaMoney();
    } else {
      goMoneyScreen("should-i-buy-result", { decisionId: rec.id });
    }
  }

  function handleNeedOrWant(label) {
    var v = validateShouldIBuyEntry();
    if (!v) return;
    moneyView.itemNameFinal = v.name;
    moneyView.priceNum = v.price;
    if (label === "Need") {
      var decisions = getPurchaseDecisions();
      decisions.push({
        id: uid("decision"), itemName: v.name, amount: v.price, needOrWant: "Need", waitPeriod: null,
        decision: "bought", moneyAvoided: 0, destination: null, createdAt: new Date().toISOString(), decideAfter: null, decidedAt: new Date().toISOString()
      });
      savePurchaseDecisions(decisions);
      moneyView.phase = "done";
      moneyView.doneMessage = "Needs are worth buying. Noted — no saving recorded.";
      renderDuniyaMoney();
    } else {
      moneyView.needOrWant = label;
      moneyView.phase = "wait";
      renderDuniyaMoney();
    }
  }

  function renderMoneyShouldIBuy(content) {
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });

    if (moneyView.phase === "wait") {
      var h2w = document.createElement("h2");
      h2w.textContent = "Wait before buying";
      content.appendChild(h2w);
      var p = document.createElement("p");
      p.className = "muted-line";
      p.textContent = "Give yourself a little time before deciding on “" + moneyView.itemNameFinal + "”.";
      content.appendChild(p);
      var waitRow = document.createElement("div");
      waitRow.className = "money-quick-actions";
      [["24 Hours", 24], ["3 Days", 72], ["7 Days", 168]].forEach(function (pair) {
        var btn = document.createElement("button");
        btn.className = "preset-plan-chip";
        btn.textContent = pair[0];
        btn.addEventListener("click", function () { saveShouldIBuyWait(pair[1], pair[0]); });
        waitRow.appendChild(btn);
      });
      content.appendChild(waitRow);
      var skipWaitBtn = document.createElement("button");
      skipWaitBtn.className = "priority-change-link";
      skipWaitBtn.textContent = "Decide now instead";
      skipWaitBtn.addEventListener("click", function () { saveShouldIBuyImmediateDecision(false); });
      content.appendChild(skipWaitBtn);
      return;
    }

    if (moneyView.phase === "done") {
      var h2d = document.createElement("h2");
      h2d.textContent = "Got it";
      content.appendChild(h2d);
      var doneMsg = document.createElement("p");
      doneMsg.className = "muted-line";
      doneMsg.textContent = moneyView.doneMessage || "Noted.";
      content.appendChild(doneMsg);
      var doneBtn = document.createElement("button");
      doneBtn.className = "btn btn-primary btn-full";
      doneBtn.textContent = "Back to Money Habits";
      doneBtn.addEventListener("click", function () { goMoneyScreen("dashboard"); });
      content.appendChild(doneBtn);
      return;
    }

    var h2 = document.createElement("h2");
    h2.textContent = "Should I buy this?";
    content.appendChild(h2);
    var itemLabel = document.createElement("p");
    itemLabel.className = "muted-line";
    itemLabel.textContent = "Item";
    content.appendChild(itemLabel);
    var itemInput = document.createElement("input");
    itemInput.type = "text";
    itemInput.className = "text-input";
    itemInput.placeholder = "e.g. Wireless earbuds";
    itemInput.value = moneyView.itemName || "";
    itemInput.addEventListener("input", function () { moneyView.itemName = itemInput.value; });
    content.appendChild(itemInput);

    var priceLabel = document.createElement("p");
    priceLabel.className = "muted-line";
    priceLabel.style.marginTop = "10px";
    priceLabel.textContent = "Price";
    content.appendChild(priceLabel);
    var priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.className = "text-input";
    priceInput.placeholder = "₹1999";
    priceInput.value = moneyView.price || "";
    priceInput.addEventListener("input", function () { moneyView.price = priceInput.value; });
    content.appendChild(priceInput);

    var needLabel = document.createElement("p");
    needLabel.className = "muted-line";
    needLabel.style.marginTop = "10px";
    needLabel.textContent = "Need or Want?";
    content.appendChild(needLabel);
    var needRow = document.createElement("div");
    needRow.className = "money-quick-actions";
    ["Need", "Want", "Not Sure"].forEach(function (label) {
      var btn = document.createElement("button");
      btn.className = "preset-plan-chip";
      btn.textContent = label;
      btn.addEventListener("click", function () { handleNeedOrWant(label); });
      needRow.appendChild(btn);
    });
    content.appendChild(needRow);
  }

  function renderMoneyDecisionResult(content) {
    var decisions = getPurchaseDecisions();
    var d = decisions.find(function (x) { return x.id === moneyView.decisionId; });
    if (!d) { goMoneyScreen("dashboard"); return; }
    var h2 = document.createElement("h2");
    h2.textContent = fmtRupee(d.amount) + " avoided";
    content.appendChild(h2);
    var whereP = document.createElement("p");
    whereP.className = "muted-line";
    whereP.textContent = "Where should this money go?";
    content.appendChild(whereP);
    var destRow = document.createElement("div");
    destRow.className = "money-quick-actions";
    var goal = getActiveGoal();
    if (goal && !goal.completedAt) {
      var addBtn = document.createElement("button");
      addBtn.className = "btn btn-primary btn-full";
      addBtn.textContent = "Add to Saving Goal";
      addBtn.addEventListener("click", function () {
        d.destination = goal.id;
        savePurchaseDecisions(decisions);
        var r = addToGoal(goal.id, d.amount);
        if (r && r.justCompleted) { goMoneyScreen("goal-completed", { goalId: goal.id }); return; }
        showToast("Added to Saving Goal");
        goMoneyScreen("dashboard");
      });
      destRow.appendChild(addBtn);
    }
    var genBtn = document.createElement("button");
    genBtn.className = "btn btn-outline btn-full";
    genBtn.textContent = "General Savings";
    genBtn.addEventListener("click", function () {
      d.destination = "general";
      savePurchaseDecisions(decisions);
      goMoneyScreen("dashboard");
    });
    destRow.appendChild(genBtn);
    content.appendChild(destRow);
  }

  // -- Weekly report --

  function renderMoneyWeeklyReport(content) {
    buildMoneyBack(content, function () { goMoneyScreen("dashboard"); });
    var h2 = document.createElement("h2");
    h2.textContent = "This Week";
    content.appendChild(h2);

    var last7 = getLastNDateKeys(7);
    var weekStart = last7[last7.length - 1];
    var prev7 = getLastNDateKeys(14).slice(7);

    var thisWeek = computeMoneySaved(weekStart, null, null);
    var goal = getActiveGoal();
    var transferred = goal ? computeMoneySaved(weekStart, null, goal.id).total : 0;

    var avoidedP = document.createElement("p");
    var avoidedStrong = document.createElement("strong");
    avoidedStrong.textContent = fmtRupee(thisWeek.total);
    avoidedP.appendChild(document.createTextNode("Money avoided: "));
    avoidedP.appendChild(avoidedStrong);
    content.appendChild(avoidedP);
    var transferredP = document.createElement("p");
    var transferredStrong = document.createElement("strong");
    transferredStrong.textContent = fmtRupee(transferred);
    transferredP.appendChild(document.createTextNode("Transferred to savings: "));
    transferredP.appendChild(transferredStrong);
    content.appendChild(transferredP);

    var habits = getMoneyHabits().filter(function (h) { return !h.archived; });
    var thisWeekSpend = 0, lastWeekSpend = 0;
    var logs = getMoneyDailyLogs();
    habits.forEach(function (habit) {
      last7.forEach(function (dateKey) {
        var e = logs[dateKey] && logs[dateKey][habit.id];
        if (e) thisWeekSpend += e.actualQuantity * habit.costPerUnit;
      });
      prev7.forEach(function (dateKey) {
        var e = logs[dateKey] && logs[dateKey][habit.id];
        if (e) lastWeekSpend += e.actualQuantity * habit.costPerUnit;
      });
    });
    if (habits.length) {
      var spendHeader = document.createElement("p");
      spendHeader.className = "muted-line";
      spendHeader.style.marginTop = "14px";
      spendHeader.textContent = "Habit spending";
      content.appendChild(spendHeader);
      var spendBox = document.createElement("div");
      spendBox.className = "money-cost-breakdown";
      var diffLess = thisWeekSpend <= lastWeekSpend;
      var diffAmt = diffLess ? (lastWeekSpend - thisWeekSpend) : (thisWeekSpend - lastWeekSpend);
      spendBox.innerHTML =
        '<div class="row"><span>Last week</span><span>' + fmtRupee(lastWeekSpend) + '</span></div>' +
        '<div class="row"><span>This week</span><span>' + fmtRupee(thisWeekSpend) + '</span></div>' +
        '<div class="row highlight"><span>Difference</span><span>' + fmtRupee(diffAmt) + (diffLess ? " less spent" : " more spent") + '</span></div>';
      content.appendChild(spendBox);

      if (diffLess && diffAmt > 0) {
        var impactP = document.createElement("p");
        impactP.className = "muted-line";
        impactP.style.marginTop = "8px";
        impactP.textContent = "If this continued for 4 weeks: ≈ " + fmtRupee(diffAmt * 4) + " (estimate, not guaranteed).";
        content.appendChild(impactP);
      }
    }

    if (goal) {
      var goalLine = document.createElement("p");
      goalLine.style.marginTop = "14px";
      var goalStrong = document.createElement("strong");
      goalStrong.textContent = fmtRupee(goal.currentSavedAmount) + " / " + fmtRupee(goal.targetAmount);
      goalLine.appendChild(document.createTextNode("Saving Goal: "));
      goalLine.appendChild(goalStrong);
      content.appendChild(goalLine);
    }

    var graphHeader = document.createElement("p");
    graphHeader.className = "muted-line";
    graphHeader.style.marginTop = "14px";
    graphHeader.textContent = "Daily savings this week";
    content.appendChild(graphHeader);
    content.appendChild(renderMoneyWeekGraph());
  }

  // -- Goal completed --

  function renderMoneyGoalCompleted(content) {
    var goal = getMoneyGoals().find(function (g) { return g.id === moneyView.goalId; });
    if (!goal) { goMoneyScreen("dashboard"); return; }
    var celebrate = document.createElement("div");
    celebrate.style.textAlign = "center";
    var emoji = document.createElement("h2");
    emoji.textContent = "🎉 " + fmtRupee(goal.targetAmount) + " SAVING GOAL COMPLETED";
    celebrate.appendChild(emoji);
    var sub = document.createElement("p");
    sub.className = "muted-line";
    sub.textContent = "You reached your target for “" + goal.name + "”.";
    celebrate.appendChild(sub);
    content.appendChild(celebrate);

    var days = Math.max(1, Math.round((new Date(goal.completedAt) - new Date(goal.createdAt)) / 86400000));
    var breakdown = computeMoneySaved(null, null, goal.id);

    var stats = document.createElement("div");
    stats.className = "money-cost-breakdown";
    stats.style.marginTop = "16px";
    stats.innerHTML =
      '<div class="row highlight"><span>Total saved</span><span>' + fmtRupee(goal.currentSavedAmount) + '</span></div>' +
      '<div class="row"><span>Days taken</span><span>' + days + '</span></div>' +
      '<div class="row"><span>Avoided unnecessary spending</span><span>' + fmtRupee(breakdown.fromPurchases + breakdown.fromDecisions) + '</span></div>' +
      '<div class="row"><span>Money saved from reduced habits</span><span>' + fmtRupee(breakdown.fromHabits) + '</span></div>';
    content.appendChild(stats);

    var newGoalBtn = document.createElement("button");
    newGoalBtn.className = "btn btn-primary btn-full";
    newGoalBtn.style.marginTop = "16px";
    newGoalBtn.textContent = "Create New Goal";
    newGoalBtn.addEventListener("click", function () {
      markGoalCelebrationSeen(goal.id);
      setActiveGoalId(null);
      goMoneyScreen("new-goal");
    });
    content.appendChild(newGoalBtn);

    var continueBtn = document.createElement("button");
    continueBtn.className = "btn btn-outline btn-full";
    continueBtn.textContent = "Continue Saving";
    continueBtn.addEventListener("click", function () {
      markGoalCelebrationSeen(goal.id);
      goMoneyScreen("dashboard");
    });
    content.appendChild(continueBtn);
  }

  // -- Router --

  function renderDuniyaMoney() {
    var content = document.getElementById("duniya-money-content");
    if (!moneyView) moneyView = { screen: "dashboard" };
    if (moneyView.screen === "dashboard") {
      var activeGoal = getActiveGoal();
      if (activeGoal && activeGoal.completedAt && !activeGoal.celebrationSeen) {
        moneyView = { screen: "goal-completed", goalId: activeGoal.id };
      }
    }
    content.innerHTML = "";
    if (moneyView.screen === "new-goal") renderMoneyNewGoal(content);
    else if (moneyView.screen === "habit-setup") renderMoneyHabitSetup(content);
    else if (moneyView.screen === "habit-checkin") renderMoneyHabitCheckin(content);
    else if (moneyView.screen === "avoided-purchase") renderMoneyAvoidedPurchase(content);
    else if (moneyView.screen === "should-i-buy") renderMoneyShouldIBuy(content);
    else if (moneyView.screen === "should-i-buy-result") renderMoneyDecisionResult(content);
    else if (moneyView.screen === "weekly-report") renderMoneyWeeklyReport(content);
    else if (moneyView.screen === "goal-completed") renderMoneyGoalCompleted(content);
    else renderMoneyDashboard(content);
  }

  function initDuniyaMoney() {
    document.getElementById("duniya-money-back").addEventListener("click", function () {
      moneyView = { screen: "dashboard" };
      setActiveView("duniya");
    });
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
    initDuniyaGrowth();
    initDuniyaPlan();
    renderHome();
    renderMore();
  });
})();
