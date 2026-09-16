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

  // ---------- TASKS (Home) ----------

  function getTasks() {
    return readJSON("nc_tasks", []);
  }

  function saveTasks(tasks) {
    writeJSON("nc_tasks", tasks);
  }

  function addTask(title) {
    var tasks = getTasks();
    tasks.push({ id: uid("t"), title: title, date: todayKey(), done: false, createdAt: Date.now() });
    saveTasks(tasks);
  }

  function toggleTaskDone(id) {
    var tasks = getTasks();
    tasks.forEach(function (t) {
      if (t.id === id) t.done = !t.done;
    });
    saveTasks(tasks);
  }

  function rescheduleTaskToTomorrow(id) {
    var tasks = getTasks();
    tasks.forEach(function (t) {
      if (t.id === id) t.date = tomorrowKey();
    });
    saveTasks(tasks);
  }

  function deleteTask(id) {
    var tasks = getTasks().filter(function (t) { return t.id !== id; });
    saveTasks(tasks);
  }

  function buildTaskItem(task) {
    var item = document.createElement("div");
    item.className = "task-item" + (task.done ? " done" : "");

    var name = document.createElement("span");
    name.className = "task-name";
    name.textContent = task.title;

    var actions = document.createElement("div");
    actions.className = "task-actions";

    var check = document.createElement("button");
    check.className = "task-check" + (task.done ? " done" : "");
    check.textContent = task.done ? "Done" : "Mark done";
    check.addEventListener("click", function () {
      toggleTaskDone(task.id);
      renderHome();
    });

    var reschedule = document.createElement("button");
    reschedule.className = "task-reschedule";
    reschedule.textContent = "→ tomorrow";
    reschedule.addEventListener("click", function () {
      rescheduleTaskToTomorrow(task.id);
      renderHome();
      showToast("Moved to tomorrow");
    });

    var del = document.createElement("button");
    del.className = "task-delete";
    del.textContent = "✕";
    del.setAttribute("aria-label", "Delete task");
    del.addEventListener("click", function () {
      deleteTask(task.id);
      renderHome();
    });

    actions.appendChild(check);
    actions.appendChild(reschedule);
    actions.appendChild(del);
    item.appendChild(name);
    item.appendChild(actions);
    return item;
  }

  function renderHome() {
    document.getElementById("home-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    var name = localStorage.getItem("nc_user_name");
    document.getElementById("home-greeting").textContent = name ? ("Assalamu Alaikum, " + name) : "Assalamu Alaikum";
    document.getElementById("avatar-initial").textContent = name ? name.charAt(0).toUpperCase() : "N";

    var key = todayKey();
    var todaysTasks = getTasks().filter(function (t) { return t.date === key; });
    var doneCount = todaysTasks.filter(function (t) { return t.done; }).length;
    document.getElementById("tasks-count-badge").textContent = doneCount + " of " + todaysTasks.length;

    var nextTask = todaysTasks.find(function (t) { return !t.done; });
    document.getElementById("next-action-text").textContent = nextTask
      ? nextTask.title
      : (todaysTasks.length ? "Everything on today's list is done." : "Nothing scheduled yet — add your first task below.");

    var list = document.getElementById("task-list");
    list.innerHTML = "";
    todaysTasks.forEach(function (t) {
      list.appendChild(buildTaskItem(t));
    });

    renderFocusTargetLine();
  }

  function initTaskForm() {
    var input = document.getElementById("task-input");
    var btn = document.getElementById("add-task-btn");

    function save() {
      var val = input.value.trim();
      if (val) {
        addTask(val);
        input.value = "";
        renderHome();
      }
    }

    btn.addEventListener("click", save);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") save();
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

  var focusState = { remaining: focusSecondsTotal(), running: false, intervalId: null, linkedTaskId: null };

  function formatClock(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function renderFocusTargetLine() {
    var line = document.getElementById("focus-target-line");
    if (focusState.linkedTaskId) {
      var task = getTasks().find(function (t) { return t.id === focusState.linkedTaskId; });
      line.textContent = task ? ("Focusing on: " + task.title) : "Pick a task above, then start a focus session.";
    } else {
      line.textContent = "Pick a task above, then start a focus session.";
    }
  }

  function updateFocusUI() {
    var total = focusSecondsTotal();
    document.getElementById("focus-clock").textContent = formatClock(focusState.remaining);
    document.getElementById("focus-status-badge").textContent = focusState.running ? "Running" : (focusState.remaining < total ? "Paused" : "Ready");
    document.getElementById("focus-start-btn").classList.toggle("hidden", focusState.running || focusState.remaining < total);
    document.getElementById("focus-pause-btn").classList.toggle("hidden", !focusState.running);
    document.getElementById("focus-stop-btn").classList.toggle("hidden", focusState.remaining === total && !focusState.running);
    var resumeShown = !focusState.running && focusState.remaining > 0 && focusState.remaining < total;
    document.getElementById("focus-start-btn").textContent = resumeShown ? "Resume" : ("Start " + getFocusDurationMinutes() + " min focus");
    document.getElementById("focus-start-btn").classList.toggle("hidden", focusState.running);
    renderFocusDurationUI();
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

  function startFocus() {
    var key = todayKey();
    var nextTask = getTasks().find(function (t) { return t.date === key && !t.done; });
    focusState.linkedTaskId = nextTask ? nextTask.id : null;
    focusState.running = true;
    stopFocusInterval();
    focusState.intervalId = setInterval(tickFocus, 1000);
    renderFocusTargetLine();
    updateFocusUI();
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
    focusState.linkedTaskId = null;
    renderFocusTargetLine();
    updateFocusUI();
  }

  function openFocusCheckModal() {
    var task = focusState.linkedTaskId ? getTasks().find(function (t) { return t.id === focusState.linkedTaskId; }) : null;
    document.getElementById("focus-check-text").textContent = task
      ? ("Did you actually finish “" + task.title + "”, or just the timer?")
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
    document.getElementById("focus-start-btn").addEventListener("click", startFocus);
    document.getElementById("focus-pause-btn").addEventListener("click", pauseFocus);
    document.getElementById("focus-stop-btn").addEventListener("click", stopFocus);

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
      if (focusState.linkedTaskId) {
        toggleTaskDoneIfNotDone(focusState.linkedTaskId);
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

  function toggleTaskDoneIfNotDone(id) {
    var tasks = getTasks();
    tasks.forEach(function (t) {
      if (t.id === id && !t.done) t.done = true;
    });
    saveTasks(tasks);
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
      source: "Sahih Muslim 597a, narrated by Abu Hurairah"
    },
    {
      arabic: "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ وَلَا يُحِيطُونَ بِشَىْءٍ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ وَلَا يَـُٔودُهُۥ حِفْظُهُمَا وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ",
      transliteration: null,
      meaning: "Ayat al-Kursi (Surah Al-Baqarah 2:255). Translation not yet added — see Sunnah → Quran for the verified Arabic source.",
      source: "Reciting it after each prescribed prayer: An-Nasa’i, Al-Kubra 9848, graded sahih by An-Nasa’i and Ibn Hibban, narrated by Abu Umamah. Verse text: Tanzil Project (Qur’an 2:255)."
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
    transliteration: null,
    meaning: "Ayat al-Kursi (Surah Al-Baqarah 2:255). Translation not yet added — see Sunnah → Quran for the verified Arabic source.",
    source: "Tanzil Project (Qur’an 2:255)"
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
          transliteration: null,
          meaning: "(2:285) The Messenger has believed in what was revealed to him from his Lord, and [so have] the believers. All of them have believed in Allah and His angels and His books and His messengers, “We make no distinction between any of His messengers.” And they say, “We hear and we obey. [We seek] Your forgiveness, our Lord, and to You is the [final] destination.” (2:286) Allah does not charge a soul except with that within its capacity. It will have the consequence of what good it has gained, and it will bear the consequence of what evil it has earned. “Our Lord, do not impose blame upon us if we have forgotten or erred. Our Lord, do not lay upon us a burden like that which You laid upon those before us. Our Lord, do not burden us with that which we have no ability to bear. And pardon us, and forgive us, and have mercy upon us. You are our protector, so give us victory over the disbelieving people.”",
          source: "Arabic: Tanzil Project (Qur’an 2:285–286). Translation: Saheeh International, via the Quran Foundation API (api.quran.com)."
        }
      ] },
      { id: "bs-tasbih", name: "Tasbih before sleep" },
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
      { id: "ma-quran", name: "Read a portion of Qur'an" }
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
      { id: "wt-pray", name: "Pray Witr" }
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

  function buildSunnahItemDetail(items) {
    var detail = document.createElement("div");
    detail.className = "sunnah-item-detail hidden";
    items.forEach(function (entry, idx) {
      if (idx > 0) {
        var divider = document.createElement("div");
        divider.className = "sunnah-item-divider";
        detail.appendChild(divider);
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

    item.appendChild(toggle);
    wrap.appendChild(item);

    if (action.items && action.items.length) {
      var detail = buildSunnahItemDetail(action.items);
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

  function initSunnahSubtabs() {
    var buttons = document.querySelectorAll("#sunnah-subtabs .subtab");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        document.querySelectorAll(".sunnah-panel").forEach(function (p) { p.classList.add("hidden"); });
        document.getElementById("sunnah-panel-" + btn.dataset.subtab).classList.remove("hidden");
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
      document.getElementById("verse-ref").textContent = "Surah " + verse.surah + ":" + verse.ayah;
      document.getElementById("verse-arabic").textContent = verse.text;
      box.classList.remove("hidden");
    }).catch(function () {
      box.classList.add("hidden");
    });
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
          "Go to Home, add that one thing as a task, then start a 20-minute focus session. When the timer ends I'll ask if it's actually done — not just if the timer finished."
        ];
      }
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
          "You could also jump to today's tasks and start a focus session on something else.",
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
          "Pick the one subject or task that matters most right now and add it on Home.",
          "Start a 20-minute focus session on just that one thing — one block at a time beats trying to do everything at once."
        ];
      }
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
    card.classList.remove("hidden");
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
    document.getElementById("open-shield").addEventListener("click", openShield);
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
    initTaskForm();
    initFocusTimer();
    initSunnahSubtabs();
    initDuasUI();
    initHadithUI();
    initVault();
    initShield();
    initMore();
    renderHome();
    renderMore();
  });
})();
