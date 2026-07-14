const HOLIDAYS = {
  "2026-08-15": "광복절",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-09-27": "대체공휴일",
  "2026-10-03": "개천절",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
};

const MONTHS = [6, 7, 8, 9, 10, 11];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const state = {
  data: {
    vacations: [],
    byEmployee: [],
    byMonth: [],
    stats: { totalPlans: 0, totalEmployees: 0 },
  },
  editingId: null,
};

const summaryCards = document.getElementById("summaryCards");
const calendarGrid = document.getElementById("calendarGrid");
const memberList = document.getElementById("memberList");
const monthList = document.getElementById("monthList");
const vacationForm = document.getElementById("vacationForm");
const formTitle = document.getElementById("formTitle");
const submitButton = document.getElementById("submitButton");
const cancelEditButton = document.getElementById("cancelEditButton");
const overlapDialog = document.getElementById("overlapDialog");
const overlapMessages = document.getElementById("overlapMessages");
const closeDialogButton = document.getElementById("closeDialogButton");

function formatDate(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatRange(startDate, endDate) {
  return `${formatDate(startDate)} ~ ${formatDate(endDate)}`;
}

function getEmployeeColor(name) {
  const palette = [
    "#9dd9d2",
    "#f9d8a3",
    "#f4b9b2",
    "#b9d4f2",
    "#d1c4f9",
    "#b7e4c7",
    "#fcd5ce",
    "#f8c4b4",
    "#cdeac0",
    "#c7d2fe",
  ];
  const seed = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[seed % palette.length];
}

function isVacationOnDate(vacation, dateText) {
  return vacation.startDate <= dateText && dateText <= vacation.endDate;
}

function setData(data) {
  state.data = data;
  renderSummary(data);
  renderCalendar(data);
  renderMembers(data);
  renderMonths(data);
}

function renderSummary(data) {
  const busiest = [...data.byMonth]
    .sort((a, b) => b.vacations.length - a.vacations.length)[0];

  const cards = [
    { label: "등록 건수", value: data.stats.totalPlans, caption: "누적 휴가 일정" },
    { label: "참여 인원", value: data.stats.totalEmployees, caption: "휴가 등록한 팀원" },
    {
      label: "가장 붐비는 달",
      value: busiest ? `${Number(busiest.month.slice(5, 7))}월` : "-",
      caption: busiest ? `${busiest.vacations.length}건 등록` : "아직 데이터 없음",
    },
    {
      label: "등록 범위",
      value: "7월-12월",
      caption: "2026년 하반기 캘린더",
    },
  ];

  summaryCards.innerHTML = cards
    .map(
      (card) => `
        <article class="stat-card">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
          <span>${card.caption}</span>
        </article>
      `,
    )
    .join("");
}

function renderCalendar(data) {
  calendarGrid.innerHTML = MONTHS.map((monthIndex) => renderMonthCard(monthIndex, data.vacations)).join("");
}

function renderMonthCard(monthIndex, vacations) {
  const monthDate = new Date(2026, monthIndex, 1);
  const monthLabel = `${monthIndex + 1}월`;
  const firstWeekday = monthDate.getDay();
  const lastDate = new Date(2026, monthIndex + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push('<div class="day-cell placeholder"></div>');
  }

  for (let day = 1; day <= lastDate; day += 1) {
    const currentDate = new Date(2026, monthIndex, day);
    const dateText = currentDate.toISOString().slice(0, 10);
    const weekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
    const holidayLabel = HOLIDAYS[dateText] || "";
    const activeVacations = vacations.filter((vacation) => isVacationOnDate(vacation, dateText));
    const classes = ["day-cell"];

    if (weekend) {
      classes.push("weekend");
    }
    if (holidayLabel) {
      classes.push("holiday");
    }

    cells.push(`
      <article class="${classes.join(" ")}">
        <div class="day-topline">
          <span class="day-number">${day}</span>
          <span class="holiday-label">${holidayLabel}</span>
        </div>
        <div class="vacation-chip-list">
          ${activeVacations
            .map(
              (vacation) => `
                <span class="vacation-chip" style="background:${getEmployeeColor(vacation.employeeName)}">
                  ${vacation.employeeName}
                </span>
              `,
            )
            .join("")}
        </div>
      </article>
    `);
  }

  return `
    <section class="month-card">
      <h3>2026년 ${monthLabel}</h3>
      <div class="calendar">
        <div class="weekday-row">
          ${WEEKDAYS.map((day) => `<div class="weekday-cell">${day}</div>`).join("")}
        </div>
        <div class="days-grid">
          ${cells.join("")}
        </div>
      </div>
    </section>
  `;
}

function renderMembers(data) {
  if (!data.byEmployee.length) {
    memberList.innerHTML = '<p class="empty-state">등록된 휴가 계획이 아직 없습니다.</p>';
    return;
  }

  memberList.innerHTML = data.byEmployee
    .map(
      (group) => `
        <section class="member-card">
          <h3>${group.employeeName}</h3>
          ${group.vacations.map(renderVacationItem).join("")}
        </section>
      `,
    )
    .join("");
}

function renderMonths(data) {
  monthList.innerHTML = data.byMonth
    .map((group) => {
      const monthNumber = Number(group.month.slice(5, 7));
      const body = group.vacations.length
        ? group.vacations.map(renderVacationItem).join("")
        : '<p class="empty-state">해당 월에 등록된 휴가가 없습니다.</p>';
      return `
        <section class="member-card">
          <h3>2026년 ${monthNumber}월</h3>
          ${body}
        </section>
      `;
    })
    .join("");
}

function renderVacationItem(vacation) {
  return `
    <article class="vacation-item">
      <div class="vacation-meta">
        <span class="vacation-badge" style="background:${getEmployeeColor(vacation.employeeName)}"></span>
        <div>
          <p class="vacation-title">${vacation.employeeName}</p>
          <p class="vacation-dates">${formatRange(vacation.startDate, vacation.endDate)}</p>
        </div>
      </div>
      <div class="item-actions">
        <button class="secondary-button" type="button" data-action="edit" data-id="${vacation.id}">수정</button>
        <button class="secondary-button delete-button" type="button" data-action="delete" data-id="${vacation.id}">삭제</button>
      </div>
    </article>
  `;
}

async function fetchVacations() {
  const response = await fetch("/api/vacations");
  const data = await response.json();
  setData(data);
}

function resetForm() {
  vacationForm.reset();
  state.editingId = null;
  formTitle.textContent = "새 휴가 일정 등록";
  submitButton.textContent = "휴가계획 저장";
  cancelEditButton.classList.add("hidden");
}

function fillForm(vacation) {
  state.editingId = vacation.id;
  formTitle.textContent = "휴가 일정 수정";
  submitButton.textContent = "휴가계획 수정";
  cancelEditButton.classList.remove("hidden");
  document.getElementById("employeeName").value = vacation.employeeName;
  document.getElementById("startDate").value = vacation.startDate;
  document.getElementById("endDate").value = vacation.endDate;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showOverlapDialog(overlaps) {
  if (!overlaps.length) {
    return;
  }

  overlapMessages.innerHTML = overlaps
    .map(
      (overlap) =>
        `<p>${overlap.employeeName}님이 등록한 ${formatDate(overlap.startDate)}부터 ${formatDate(overlap.endDate)}까지 휴가 기간이 겹칩니다. 참고하세요.</p>`,
    )
    .join("");
  overlapDialog.showModal();
}

async function submitVacation(event) {
  event.preventDefault();

  const payload = {
    employeeName: document.getElementById("employeeName").value.trim(),
    startDate: document.getElementById("startDate").value,
    endDate: document.getElementById("endDate").value,
  };

  const url = state.editingId ? `/api/vacations/${state.editingId}` : "/api/vacations";
  const method = state.editingId ? "PUT" : "POST";
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (!response.ok) {
    alert(result.error || "저장 중 오류가 발생했습니다.");
    return;
  }

  setData(result.data);
  resetForm();
  showOverlapDialog(result.overlaps || []);
}

async function deleteVacation(id) {
  const confirmed = window.confirm("이 휴가 계획을 삭제하시겠습니까?");
  if (!confirmed) {
    return;
  }

  const response = await fetch(`/api/vacations/${id}`, { method: "DELETE" });
  const result = await response.json();
  if (!response.ok) {
    alert(result.error || "삭제 중 오류가 발생했습니다.");
    return;
  }

  if (state.editingId === id) {
    resetForm();
  }
  setData(result.data);
}

function bindDelegatedActions() {
  document.body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const id = button.dataset.id;
    const action = button.dataset.action;
    const vacation = state.data.vacations.find((item) => item.id === id);

    if (action === "edit" && vacation) {
      fillForm(vacation);
    }

    if (action === "delete") {
      deleteVacation(id);
    }
  });
}

function bindTabs() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view-panel").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(`${button.dataset.view}View`).classList.add("active");
    });
  });
}

function connectStream() {
  const stream = new EventSource("/api/stream");
  stream.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.payload) {
      setData(message.payload);
    }
  };
}

vacationForm.addEventListener("submit", submitVacation);
cancelEditButton.addEventListener("click", resetForm);
closeDialogButton.addEventListener("click", () => overlapDialog.close());

bindTabs();
bindDelegatedActions();
connectStream();
fetchVacations();
