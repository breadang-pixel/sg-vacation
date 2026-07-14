import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDmNh-9ZC0OPKQzxyR52vlbKWIpRLi7Byo",
  authDomain: "sg-vacation.firebaseapp.com",
  projectId: "sg-vacation",
  storageBucket: "sg-vacation.firebasestorage.app",
  messagingSenderId: "913324539795",
  appId: "1:913324539795:web:d38583dcd0ebe81613b266",
  measurementId: "G-0F41E9816E",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const vacationsRef = collection(db, "vacations");

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

const PLAN_START = "2026-07-01";
const PLAN_END = "2026-12-31";
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(dateText) {
  const match = String(dateText).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return dateText;
  }
  return `${Number(match[2])}월 ${Number(match[3])}일`;
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

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validateVacationInput(payload) {
  const employeeName = normalizeName(payload.employeeName);
  const startDate = String(payload.startDate || "");
  const endDate = String(payload.endDate || "");

  if (!employeeName) {
    return { error: "직원명을 입력해 주세요." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { error: "시작일과 종료일을 정확히 선택해 주세요." };
  }
  if (startDate > endDate) {
    return { error: "종료일은 시작일보다 빠를 수 없습니다." };
  }
  if (startDate < PLAN_START || endDate > PLAN_END) {
    return { error: "휴가 기간은 2026년 7월 1일부터 12월 31일까지로 제한됩니다." };
  }

  return { employeeName, startDate, endDate };
}

function findOverlaps(vacations, candidate, ignoreId) {
  return vacations
    .filter((item) => item.id !== ignoreId)
    .filter((item) => candidate.startDate <= item.endDate && item.startDate <= candidate.endDate)
    .map((item) => ({
      id: item.id,
      employeeName: item.employeeName,
      startDate: item.startDate,
      endDate: item.endDate,
    }));
}

function summarizeVacations(vacations) {
  const sortedVacations = [...vacations].sort((a, b) => {
    const dateCompare = a.startDate.localeCompare(b.startDate);
    return dateCompare !== 0 ? dateCompare : a.employeeName.localeCompare(b.employeeName, "ko");
  });

  const employees = [...new Set(sortedVacations.map((item) => item.employeeName))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );

  const byEmployee = employees.map((employeeName) => ({
    employeeName,
    vacations: sortedVacations.filter((item) => item.employeeName === employeeName),
  }));

  const byMonth = ["07", "08", "09", "10", "11", "12"].map((month) => {
    const monthStart = `2026-${month}-01`;
    const monthEnd = `2026-${month}-${String(new Date(2026, Number(month), 0).getDate()).padStart(2, "0")}`;
    return {
      month: `2026-${month}`,
      vacations: sortedVacations.filter((item) => item.startDate <= monthEnd && monthStart <= item.endDate),
    };
  });

  return {
    vacations: sortedVacations,
    stats: {
      totalPlans: sortedVacations.length,
      totalEmployees: employees.length,
    },
    byEmployee,
    byMonth,
  };
}

function setData(data) {
  state.data = data;
  renderSummary(data);
  renderCalendar(data);
  renderMembers(data);
  renderMonths(data);
}

function renderSummary(data) {
  const busiest = [...data.byMonth].sort((a, b) => b.vacations.length - a.vacations.length)[0];

  const cards = [
    { label: "등록 건수", value: data.stats.totalPlans, caption: "누적 휴가 일정" },
    { label: "참여 인원", value: data.stats.totalEmployees, caption: "휴가 등록한 팀원" },
    {
      label: "가장 붐비는 달",
      value: busiest ? `${Number(busiest.month.slice(5, 7))}월` : "-",
      caption: busiest ? `${busiest.vacations.length}건 등록` : "아직 데이터 없음",
    },
    { label: "등록 범위", value: "7월-12월", caption: "2026년 하반기 캘린더" },
  ];

  summaryCards.innerHTML = cards
    .map(
      (card) => `
        <article class="stat-card">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <span>${escapeHtml(card.caption)}</span>
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
    const dateText = `2026-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
          <span class="holiday-label">${escapeHtml(holidayLabel)}</span>
        </div>
        <div class="vacation-chip-list">
          ${activeVacations
            .map(
              (vacation) => `
                <span class="vacation-chip" style="background:${getEmployeeColor(vacation.employeeName)}">
                  ${escapeHtml(vacation.employeeName)}
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
          <h3>${escapeHtml(group.employeeName)}</h3>
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
          <p class="vacation-title">${escapeHtml(vacation.employeeName)}</p>
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
        `<p>${escapeHtml(overlap.employeeName)}님이 등록한 ${formatDate(overlap.startDate)}부터 ${formatDate(overlap.endDate)}까지 휴가 기간이 겹칩니다. 참고하세요.</p>`,
    )
    .join("");
  overlapDialog.showModal();
}

async function submitVacation(event) {
  event.preventDefault();

  const payload = validateVacationInput({
    employeeName: document.getElementById("employeeName").value,
    startDate: document.getElementById("startDate").value,
    endDate: document.getElementById("endDate").value,
  });

  if (payload.error) {
    alert(payload.error);
    return;
  }

  submitButton.disabled = true;
  const overlaps = findOverlaps(state.data.vacations, payload, state.editingId);

  try {
    if (state.editingId) {
      await updateDoc(doc(db, "vacations", state.editingId), {
        employeeName: payload.employeeName,
        startDate: payload.startDate,
        endDate: payload.endDate,
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(vacationsRef, {
        employeeName: payload.employeeName,
        startDate: payload.startDate,
        endDate: payload.endDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    resetForm();
    showOverlapDialog(overlaps);
  } catch (error) {
    alert(`저장 중 오류가 발생했습니다. Firestore 권한 설정을 확인해 주세요.\n\n${error.message}`);
  } finally {
    submitButton.disabled = false;
  }
}

async function deleteVacation(id) {
  const confirmed = window.confirm("이 휴가 계획을 삭제하시겠습니까?");
  if (!confirmed) {
    return;
  }

  try {
    await deleteDoc(doc(db, "vacations", id));
    if (state.editingId === id) {
      resetForm();
    }
  } catch (error) {
    alert(`삭제 중 오류가 발생했습니다. Firestore 권한 설정을 확인해 주세요.\n\n${error.message}`);
  }
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

function subscribeVacations() {
  onSnapshot(
    vacationsRef,
    (snapshot) => {
      const vacations = snapshot.docs.map((documentSnapshot) => {
        const data = documentSnapshot.data();
        return {
          id: documentSnapshot.id,
          employeeName: data.employeeName || "",
          startDate: data.startDate || "",
          endDate: data.endDate || "",
          createdAt: data.createdAt?.toDate?.().toISOString?.() || "",
          updatedAt: data.updatedAt?.toDate?.().toISOString?.() || "",
        };
      });

      setData(summarizeVacations(vacations));
    },
    (error) => {
      alert(`Firebase 연결 오류가 발생했습니다. Firestore Database와 Rules 설정을 확인해 주세요.\n\n${error.message}`);
    },
  );
}

vacationForm.addEventListener("submit", submitVacation);
cancelEditButton.addEventListener("click", resetForm);
closeDialogButton.addEventListener("click", () => overlapDialog.close());

bindTabs();
bindDelegatedActions();
subscribeVacations();

