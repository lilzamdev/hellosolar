// Hello Solar Super Admin - Application Controller & State Engine

(function () {
  const db = window.HELLO_SOLAR_DB;

  // --- ROLE-BASED ACCESS (Super Admin vs Direct Installation Engineer) ---
  const SESSION = (window.SuperAdminAuth && window.SuperAdminAuth.getSession && window.SuperAdminAuth.getSession()) || {};
  const IS_ENGINEER = SESSION.role === "direct-engineer";
  const ENGINEER = { name: SESSION.name || "Installation Engineer", actorId: SESSION.accountId || SESSION.actorId || "ENG-DEMO" };
  const ENGINEER_PAGES = ["applications", "installations", "site-visits", "maintenance"];
  // Accounting accounts see only the Accounting page
  const IS_ACCOUNTING = SESSION.role === "accounting";
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const safeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const peso = num => new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0
  }).format(num);

  const pesoCompact = num => {
    if (num >= 1000000) return `₱${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `₱${(num / 1000).toFixed(0)}K`;
    return `₱${num}`;
  };

  const formatReadableDate = dateStr => {
    if (!dateStr || dateStr === "N/A" || dateStr === "—") return "—";
    if (dateStr === "Paid in Full") return "Paid in Full";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-").map(Number);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${months[m - 1]} ${d}, ${y}`;
    }
    return dateStr;
  };

  const parseActivityDate = dateInput => {
    if (!dateInput) return null;
    if (dateInput instanceof Date) {
      return isNaN(dateInput.getTime()) ? null : dateInput;
    }
    if (typeof dateInput === "string") {
      // Clean middle dots or bullets if present: "Sep 25, 2026 · 2:38 PM"
      const cleaned = dateInput.replace(/[·•]/g, " ").replace(/\s+/g, " ").trim();
      const dCleaned = new Date(cleaned);
      if (!isNaN(dCleaned.getTime())) return dCleaned;

      const dDirect = new Date(dateInput);
      if (!isNaN(dDirect.getTime())) return dDirect;
    }
    return null;
  };

  const formatExactTimestamp = dateInput => {
    if (!dateInput) return "";
    const d = parseActivityDate(dateInput);
    if (!d) return String(dateInput);

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const m = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;

    return `${m} ${day}, ${year} · ${hours}:${minutes} ${ampm}`;
  };

  const calculateRelativeTime = (dateInput, fromDate) => {
    if (!dateInput) return null;
    const targetDate = parseActivityDate(dateInput);
    if (!targetDate) return null;

    // Dynamically calculate from current local time
    const now = (fromDate instanceof Date && !isNaN(fromDate.getTime())) ? fromDate : new Date();
    const diffMs = now.getTime() - targetDate.getTime();

    // Clock skew tolerance: allow up to 5 seconds drift into future as "Just now"
    if (diffMs < 0 && diffMs >= -5000) {
      return "Just now";
    }
    // If timestamp is beyond 5s in the future, dynamic relative time cannot be reliably calculated
    // Rule: "If dynamic relative time cannot be reliably calculated, prefer displaying only the exact timestamp rather than showing an incorrect relative label."
    if (diffMs < -5000) {
      return null;
    }

    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSec < 45) {
      return "Just now";
    }

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin === 1) {
      return "1 min ago";
    }
    if (diffMin < 60) {
      return `${diffMin} mins ago`;
    }

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours === 1) {
      return "1 hour ago";
    }
    if (diffHours < 24) {
      return `${diffHours} hours ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      return "Yesterday";
    }
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    if (diffDays < 14) {
      return "1 week ago";
    }
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} weeks ago`;
    }
    if (diffDays < 60) {
      return "1 month ago";
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} months ago`;
    }
    return "Over a year ago";
  };

  // Backwards compatibility alias
  const formatRelativeTime = (dateInput, fromDate) => calculateRelativeTime(dateInput, fromDate);

  function matchActivityDate(timestamp, filterType) {
    if (!filterType || filterType === "all") return true;
    if (!timestamp) return true;
    const date = parseActivityDate(timestamp);
    if (!date) return true;

    // Use current local time
    const now = new Date();

    const dYear = date.getFullYear();
    const dMonth = date.getMonth();
    const dDay = date.getDate();

    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();
    const nowDay = now.getDate();

    if (filterType === "today") {
      return dYear === nowYear && dMonth === nowMonth && dDay === nowDay;
    }

    if (filterType === "yesterday") {
      const yest = new Date(now);
      yest.setDate(now.getDate() - 1);
      return dYear === yest.getFullYear() && dMonth === yest.getMonth() && dDay === yest.getDate();
    }

    if (filterType === "7days") {
      const diffMs = now.getTime() - date.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 7.5;
    }

    if (filterType === "30days") {
      const diffMs = now.getTime() - date.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 30.5;
    }

    return true;
  }

  // Application State
  const state = {
    currentPage: "overview",
    sidebarCollapsed: false,

    // Overview
    overviewActivityFilter: "All",
    overviewAttentionFilter: "All",
    overviewAttentionExpanded: false,
    overviewActivityExpanded: false,

    // Applications Page
    appStageFilter: "All",
    appSearchQuery: "",
    appFinancerFilter: "All",
    accTab: "overview",
    accSub: { in: "received", out: "funders" },
    accMonth: "",
    accLedgerStatus: "All",
    accFunderFilter: "All",
    selectedAppId: null,

    // Installations Page
    installTypeFilter: "All",
    installStatusFilter: "All",
    installSearchQuery: "",
    selectedJobId: null,

    // Accounts Page
    accountCurrentTab: "customers",
    accountSearchQuery: "",
    accountStatusFilter: "All",
    selectedAccountId: null,

    // Create Account Page
    createAccountRole: "Customer",
    createInquiryId: null,
    projectIds: null,
    lastCreatedAccountTab: "customers",

    // Payments Page
    paymentStatusFilter: "All",
    paymentSearchQuery: "",

    // Support Page
    supportStatusFilter: "All",
    supportPortalFilter: "All",
    supportPriorityFilter: "All",
    supportSearchQuery: "",
    selectedTicketId: null,

    // Contact Inquiries Page
    inquiryStatusFilter: "All",
    inquiryCategoryFilter: "All",
    inquiryResponseFilter: "All",
    inquiryPaymentFilter: "All",
    inquirySearchQuery: "",
    selectedInquiryId: null,

    // Activity Page
    activityRoleFilter: "All",
    activitySearchQuery: "",
    activityDateFilter: "all"
  };

  // --- STATUS CLASS HELPER ---
  function getStatusClass(status) {
    if (!status) return "neutral";
    const s = String(status).toLowerCase();
    if (s.includes("delay") || s.includes("declin") || s.includes("escalat") || s.includes("overdue") || s.includes("suspend") || s.includes("reject")) return "danger";
    if (s.includes("inactive")) return "neutral";
    if (s.includes("pending") || s.includes("hold") || s.includes("review") || s.includes("due soon") || s.includes("missing") || s.includes("required") || s.includes("awaiting")) return "warn";
    if (s.includes("active") || s.includes("approve") || s.includes("complete") || s.includes("testing") || s.includes("on time") || s.includes("ready") || s.includes("verifi") || s.includes("paid")) return "success";
    if (s.includes("direct")) return "direct";
    return "neutral";
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = "success", icon = "✓") {
    const container = $("#toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-msg">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px) scale(0.95)";
      toast.style.transition = "all 0.25s ease-out";
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  // --- NAVIGATION CONTROLLER ---
  function go(pageId, subOption = null) {
    // Direct Installation Engineer: block every section except Applications & Installations
    if (IS_ENGINEER && !ENGINEER_PAGES.includes(pageId)) {
      pageId = "installations";
      subOption = "direct";
    }
    if (IS_ACCOUNTING) pageId = "accounting";
    // Leaving Support closes the record opened beside it, so it does not follow onto the next page
    if (pageId !== "support" && document.body.classList.contains("support-split")) exitSupportSplit(true);
    state.currentPage = pageId;

    // Toggle pages
    $$(".page").forEach(p => p.classList.remove("active"));
    const targetPage = $(`#page-${pageId}`);
    if (targetPage) {
      targetPage.classList.add("active");
    }

    // Toggle sidebar links
    $$(".nav-link").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.page === pageId);
    });

    // Close mobile sidebar
    $("#sidebar")?.classList.remove("open");

    // Handle sub-filters
    if (pageId === "installations" && subOption) {
      if (subOption === "active") {
        state.installTypeFilter = "All";
        state.installStatusFilter = "All";
      } else if (subOption === "completed") {
        state.installTypeFilter = "Completed";
      } else if (subOption === "direct") {
        state.installTypeFilter = "Hello Solar Direct";
      }
      syncInstallTabs();
    } else if (pageId === "applications" && subOption) {
      if (subOption === "under-review" || subOption === "pending-financing") {
        state.appStageFilter = "Pending Financing";
      }
      syncAppTabs();
    } else if (pageId === "accounts" && subOption) {
      state.accountCurrentTab = subOption;
      syncAccountTabs();
    } else if (pageId === "create-account" && subOption) {
      state.createAccountRole = subOption;
    }

    // Render active view
    renderCurrentPage();

    // Update URL hash without scrolling
    history.replaceState(null, "", `#${pageId}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderCurrentPage() {
    updateBadgesAndKPIs();

    switch (state.currentPage) {
      case "overview":
        renderOverview();
        break;
      case "applications":
        renderApplications();
        break;
      case "installations":
        renderInstallations();
        break;
      case "site-visits":
        renderSiteVisits();
        break;
      case "maintenance":
        renderMaintenance();
        break;
      case "accounts":
        renderAccounts();
        break;
      case "create-account":
        renderCreateAccount();
        break;
      case "payments":
        renderPayments();
        break;
      case "accounting":
        renderAccounting();
        break;
      case "support":
        renderSupport();
        break;
      case "inquiries":
        renderInquiries();
        break;
      case "activity":
        renderActivity();
        break;
      case "settings":
        renderSettings();
        break;
    }
  }

  // --- GLOBAL BADGES & COUNTS ---
  function updateBadgesAndKPIs() {
    const apps = db.data.applications;
    const installs = db.data.installations;
    const support = db.data.support;
    const attention = db.getAttentionItems();

    // Nav badges
    if ($("#navBadgeApps")) $("#navBadgeApps").textContent = apps.length;
    if ($("#navBadgeInstalls")) $("#navBadgeInstalls").textContent = installs.filter(isInstallationWork).length;
    const unresolvedSupport = support.filter(s => s.status === "Open" || s.status === "In Progress").length;
    if ($("#navBadgeSupport")) $("#navBadgeSupport").textContent = unresolvedSupport;

    // Site visits (landing page Site Assessment requests)
    const svAll = visibleSiteVisits();
    const svToAssign = svAll.filter(v => v.status === "Pending Assignment").length;
    const svScheduled = svAll.filter(v => v.status === "Scheduled").length;
    if ($("#kpiSiteVisits")) $("#kpiSiteVisits").textContent = svToAssign + svScheduled;
    if ($("#kpiSiteVisitsSub")) $("#kpiSiteVisitsSub").textContent = `${svToAssign} to assign`;
    const svBadge = $("#navBadgeSiteVisits");
    if (svBadge) {
      const n = IS_ENGINEER ? svScheduled : svToAssign;
      svBadge.textContent = n;
      svBadge.style.display = n > 0 ? "inline-flex" : "none";
    }

    // Contact Inquiries badge (Unread public landing page inquiries)
    const inquiries = db.getInquiries ? db.getInquiries() : [];
    const unreadInquiries = inquiries.filter(i => i.status === "Unread").length;
    const inqBadge = $("#navBadgeInquiries");
    if (inqBadge) {
      inqBadge.textContent = unreadInquiries;
      inqBadge.style.display = unreadInquiries > 0 ? "inline-flex" : "none";
    }

    // Topbar - active Hello Solar Installation projects: the same projects as Accounting › Installation Costs,
    // without the completed / declined ones
    const directCount = (db.getDirectInstallationCosts ? db.getDirectInstallationCosts() : [])
      .filter(r => !["Completed", "Installation Completed", "Declined", "Cancelled"].includes(r.stage)).length;
    if ($("#quickDirectCount")) $("#quickDirectCount").textContent = `${directCount} Active Hello Solar Project${directCount === 1 ? "" : "s"}`;
    if ($("#notifBadgeCount")) $("#notifBadgeCount").textContent = attention.length;
    if ($("#notifHeadCount")) $("#notifHeadCount").textContent = attention.length;

    // Centralized Accounts directory counts
    if ($("#accountCountCust")) $("#accountCountCust").textContent = (db.data.customers || []).length;
    if ($("#accountCountFin")) $("#accountCountFin").textContent = (db.data.financers || []).length;
    if ($("#accountCountInst")) $("#accountCountInst").textContent = (db.data.installers || []).length;
    if ($("#accountCountMerch")) $("#accountCountMerch").textContent = (db.data.merchants || []).length;

    // Render notification popover items
    renderNotificationList(attention);
  }

  function renderNotificationList(items) {
    const listEl = $("#notifList");
    if (!listEl) return;

    if (!items.length) {
      listEl.innerHTML = `<div style="padding:16px; text-align:center; color:var(--muted); font-size:12px;">All systems nominal. No urgent issues.</div>`;
      return;
    }

    listEl.innerHTML = items.map(item => `
      <div class="notif-item" data-action-type="${item.actionType}" data-payload="${item.payload}">
        <div class="notif-dot" style="background:var(--${item.kind === 'danger' ? 'danger' : 'warn'})"></div>
        <div class="notif-text">
          <strong>${item.title}</strong>
          <small>${item.context}</small>
        </div>
      </div>
    `).join("");
  }

  // ==================== 1. OVERVIEW PAGE ====================
  function renderOverview() {
    const apps = db.data.applications;
    const installs = db.data.installations;
    const customers = db.data.customers;
    const financers = db.data.financers;
    const merchants = db.data.merchants;
    const attention = db.getAttentionItems();

    // 1. Main 5 KPI Cards
    const totalFunded = apps.reduce((sum, a) => sum + (a.amount || 0), 0);
    const activeInstalls = installs.filter(j => !["Completed", "Cancelled"].includes(j.status)).length;
    const completedInstalls = installs.filter(j => j.status === "Completed").length;

    if ($("#kpiTotalApps")) $("#kpiTotalApps").textContent = apps.length;
    if ($("#kpiActiveInstalls")) $("#kpiActiveInstalls").textContent = activeInstalls;
    if ($("#kpiCompletedInstalls")) $("#kpiCompletedInstalls").textContent = completedInstalls;
    if ($("#kpiTotalFunded")) $("#kpiTotalFunded").textContent = pesoCompact(totalFunded);
    if ($("#kpiNeedsAttention")) $("#kpiNeedsAttention").textContent = attention.length;

    // 2. Operations Overview
    const appsInGroup = group => apps.filter(a => stageGroupOf(a.stage) === group);
    if ($("#opsCustomerTotal")) $("#opsCustomerTotal").textContent = customers.filter(c => c.status === "Active").length;
    if ($("#opsCustomerNew")) $("#opsCustomerNew").textContent = apps.filter(a => ["Cash Applications", "Missing Documents", "Pending Financing"].includes(stageGroupOf(a.stage))).length;

    // Financing & Credit: installment accounts with approved financing vs. still waiting for a financing decision
    const installmentApps = apps.filter(a => !db.isFullPaymentApp(a));
    if ($("#opsFinancerReview")) $("#opsFinancerReview").textContent = installmentApps.filter(a => !["Missing Documents", "Pending Financing", "Declined"].includes(stageGroupOf(a.stage))).length;
    if ($("#opsFinancerPending")) $("#opsFinancerPending").textContent = installmentApps.filter(a => stageGroupOf(a.stage) === "Pending Financing").length;

    // Installation Works: started/scheduled jobs vs. accepted jobs not scheduled yet (maintenance is tracked inside each job)
    const workJobs = installs.filter(j => j.installerType !== "Maintenance" && j.status !== "Cancelled");
    if ($("#opsInstallerActive")) $("#opsInstallerActive").textContent = workJobs.filter(j => ["Scheduled", "In Progress", "Testing", "Delayed"].includes(j.status)).length;
    if ($("#opsInstallerMaint")) $("#opsInstallerMaint").textContent = workJobs.filter(j => j.status === "Ready").length + appsInGroup("Pending Installation").filter(a => !installs.some(j => j.appId === a.id)).length;

    if ($("#opsMerchantActive")) $("#opsMerchantActive").textContent = merchants.filter(m => m.status === "Active").length;
    if ($("#opsMerchantPending")) $("#opsMerchantPending").textContent = merchants.filter(m => m.status === "Review").length;

    // 3. Needs Attention List & Category Counters
    const allAttention = attention;
    const appAtt = allAttention.filter(x => x.type === "Application");
    const instAtt = allAttention.filter(x => x.type === "Installation");
    const payAtt = allAttention.filter(x => x.type === "Payment");
    const suppAtt = allAttention.filter(x => x.type === "Support");

    if ($("#overviewAttentionCount")) $("#overviewAttentionCount").textContent = allAttention.length;
    if ($("#attCountAll")) $("#attCountAll").textContent = allAttention.length;
    if ($("#attCountApps")) $("#attCountApps").textContent = appAtt.length;
    if ($("#attCountInst")) $("#attCountInst").textContent = instAtt.length;
    if ($("#attCountPay")) $("#attCountPay").textContent = payAtt.length;
    if ($("#attCountSupp")) $("#attCountSupp").textContent = suppAtt.length;

    const filteredAttention = allAttention.filter(item => {
      if (state.overviewAttentionFilter === "All") return true;
      return item.type === state.overviewAttentionFilter;
    });

    const ATT_LIMIT = 5;
    const totalAttCount = filteredAttention.length;
    const displayedAttention = state.overviewAttentionExpanded
      ? filteredAttention
      : filteredAttention.slice(0, ATT_LIMIT);

    const attListEl = $("#overviewAttentionList");
    if (attListEl) {
      if (!totalAttCount) {
        attListEl.innerHTML = `<div style="padding:24px; text-align:center; color:var(--muted); font-size:13px;">No actionable items in this category. All systems nominal!</div>`;
      } else {
        attListEl.innerHTML = displayedAttention.map(item => {
          const iconSvg = item.kind === 'danger'
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

          const issueText = item.issue || (
            item.type === "Support"
              ? (item.context && item.context.includes("·") ? item.context.split("·").pop().trim() : "High priority issue")
              : (item.title ? item.title.replace(new RegExp(`\\s+(for|:)\\s+${item.id}`, 'i'), '') : "Action required")
          );

          return `
            <div class="attention-item" data-action-type="${item.actionType}" data-payload="${item.payload}">
              <div class="attention-left">
                <div class="attention-icon-box ${item.kind}" aria-hidden="true">
                  ${iconSvg}
                </div>
                <button type="button" class="attention-id-btn" data-action-type="${item.actionType}" data-payload="${item.payload}" title="View details for ${item.id}">
                  ${item.id}
                </button>
                <span class="attention-issue-text">${issueText}</span>
              </div>
              <div class="attention-right">
                <span class="attention-source-badge ${item.type.toLowerCase()}">${item.type}</span>
              </div>
            </div>
          `;
        }).join("");
      }
    }

    // Toggle button for Needs Attention (Limit 5 rows)
    const attToggleWrap = $("#overviewAttentionToggleWrap");
    const attToggleBtn = $("#toggleAttentionRowsBtn");
    const attToggleText = $("#toggleAttentionRowsText");
    if (attToggleWrap && attToggleBtn && attToggleText) {
      if (totalAttCount > ATT_LIMIT) {
        attToggleWrap.style.display = "flex";
        attToggleBtn.setAttribute("aria-expanded", state.overviewAttentionExpanded ? "true" : "false");
        const remaining = totalAttCount - ATT_LIMIT;
        attToggleText.textContent = state.overviewAttentionExpanded
          ? "See less"
          : `See more (${remaining} more)`;
      } else {
        attToggleWrap.style.display = "none";
      }
    }

    // 4. Upcoming Site Visits
    renderOverviewSiteVisits();

    // 5. Recent Activity
    renderOverviewActivity();
  }

  function renderOverviewActivity() {
    const listEl = $("#overviewActivityList");
    if (!listEl) return;

    const filtered = db.data.activity.filter(a => {
      if (state.overviewActivityFilter === "All") return true;
      return a.role.toLowerCase() === state.overviewActivityFilter.toLowerCase();
    });

    const ACT_LIMIT = 5;
    const totalCount = filtered.length;
    const displayed = state.overviewActivityExpanded
      ? filtered
      : filtered.slice(0, ACT_LIMIT);

    if (!totalCount) {
      listEl.innerHTML = `<div style="padding:20px; text-align:center; color:var(--muted); font-size:13px;">No activity logged for this filter.</div>`;
    } else {
      listEl.innerHTML = displayed.map(act => {
        const exact = act.exactTime || formatExactTimestamp(act.timestamp);
        const rel = calculateRelativeTime(act.timestamp || act.exactTime);
        const timeHtml = rel !== null
          ? `<span class="overview-rel-time" data-timestamp="${act.timestamp || ''}" data-exact="${exact}" title="${act.timestamp ? `${act.timestamp} · Event ID: ${act.id}` : exact}">${rel} · ${exact}</span>`
          : `<span title="${act.timestamp ? `${act.timestamp} · Event ID: ${act.id}` : exact}">${exact}</span>`;

        return `
          <div class="activity-row">
            <div class="activity-left">
              <div class="activity-avatar" title="${act.role}">${act.role.slice(0, 2).toUpperCase()}</div>
              ${act.record && act.record !== "-" && act.record !== "None" ? `
                <button type="button" class="record-tag-btn" data-open-record="${act.record}" title="Open record ${act.record}">
                  <span>${act.record}</span>
                  <span class="tag-arrow" style="font-size: 9px; opacity: 0.75;">↗</span>
                </button>
              ` : ''}
            </div>
            <div class="activity-right">
              <div class="activity-desc">${act.action}</div>
              <div class="activity-meta">
                ${timeHtml}
              </div>
            </div>
          </div>
        `;
      }).join("");
    }

    // Toggle button for Recent Activity (Limit 5 rows)
    const actToggleWrap = $("#overviewActivityToggleWrap");
    const actToggleBtn = $("#toggleActivityRowsBtn");
    const actToggleText = $("#toggleActivityRowsText");
    if (actToggleWrap && actToggleBtn && actToggleText) {
      if (totalCount > ACT_LIMIT) {
        actToggleWrap.style.display = "flex";
        actToggleBtn.setAttribute("aria-expanded", state.overviewActivityExpanded ? "true" : "false");
        const remaining = totalCount - ACT_LIMIT;
        actToggleText.textContent = state.overviewActivityExpanded
          ? "See less"
          : `See more (${remaining} more)`;
      } else {
        actToggleWrap.style.display = "none";
      }
    }
  }

  // --- DIRECT INSTALLATION & ELIGIBILITY HELPERS ---
  function isDirectProject(app) {
    if (!app) return false;
    return app.installerType === "Hello Solar Direct" ||
      (app.installer && app.installer.trim().toLowerCase() === "hello solar internal team");
  }

  function hasNoInstaller(app) {
    if (!app || !app.installer) return true;
    const inst = app.installer.trim().toLowerCase();
    return inst === "" || inst === "unassigned" || inst === "none" || inst === "pending";
  }

  function isEligibleForDirect(app) {
    if (!app) return false;
    const isEligibleStage = app.stage === "Ready for Installation";
    return isEligibleStage && hasNoInstaller(app) && !isDirectProject(app);
  }

  // --- APPLICATION STATUS GROUPS (same names on the filter buttons, row badges and Summary counts) ---
  const STAGE_GROUPS = {
    "Cash Applications": ["Payment Required"],
    "Missing Documents": ["Missing Documents"],
    "Pending Financing": ["Submitted", "Financing Review", "Pending Finance", "Under Review"],
    "Pending Installation": ["Approved", "Ready for Installation"],
    "Declined": ["Declined"]
  };
  // Filter button → details tab opened by "Details"
  const STAGE_GROUP_TAB = {
    "Cash Applications": "overview",
    "Missing Documents": "documents",
    "Pending Financing": "financing",
    "Pending Installation": "installation"
  };
  // "Updated" time of an application: its latest logged activity (real time), not a fixed text
  let lastActivityCache = { size: -1, map: new Map() };
  function appUpdatedLabel(app) {
    const log = db.data.activity || [];
    if (lastActivityCache.size !== log.length) {
      const map = new Map();
      log.forEach(e => {
        const id = e && (e.recordId || e.record);
        if (!id || !e.timestamp) return;
        const t = Date.parse(e.timestamp);
        if (Number.isFinite(t) && (!map.has(id) || t > map.get(id))) map.set(id, t);
      });
      lastActivityCache = { size: log.length, map };
    }
    const t = lastActivityCache.map.get(app.id) || Date.parse(app.updatedAt || app.createdAt || "");
    if (!Number.isFinite(t)) return "—";
    return (db.formatRelativeAuditTime && db.formatRelativeAuditTime(new Date(t))) || new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function stageGroupOf(stage) {
    for (const [group, stages] of Object.entries(STAGE_GROUPS)) {
      if (stages.includes(stage)) return group;
    }
    if (stage === "Installation" || stage === "In Progress") return "Ongoing Installation";
    if (stage === "Completed" || stage === "Installation Completed") return "Completed";
    return stage || "—";
  }
  function stageGroupClass(group) {
    if (group === "Cash Applications" || group === "Pending Financing" || group === "Missing Documents" || group === "Pending Installation") return "warn";
    if (group === "Declined") return "danger";
    if (group === "Completed" || group === "Ongoing Installation") return "success";
    return getStatusClass(group);
  }

  // --- PACKAGE & PAYMENT TYPE DISPLAY ---
  // Package name of an application (the saved package, else the catalog package named in the system field)
  function packageNameOf(rec) {
    const app = rec && rec.appId ? (db.data.applications.find(a => a.id === rec.appId) || rec) : rec;
    if (!app) return "";
    const pkg = packageOf(app);
    if (pkg) return pkg.name;
    if (app.packageName) return app.packageName;
    return parseFloat(systemSizeOf(app.system)) > 16 ? "Custom Package" : "";
  }
  // Catalog package of an application. Demo records saved before packages existed get the package matching
  // their system size; above 16 kW there is no catalog package (custom).
  function packageOf(app) {
    const P = window.HELLO_SOLAR_PACKAGES;
    if (!P || !app) return null;
    const found = P.findPackage(app.packageId) || P.findPackage(app.packageName) || P.findPackage(app.system);
    if (found) return found;
    const kw = parseFloat(systemSizeOf(app.system));
    if (!Number.isFinite(kw) || kw > 16) return null;
    return P.findPackage(kw <= 5 ? "hs6-lite" : kw <= 6 ? "hs6-pro" : kw <= 8 ? "hs8-pro" : kw <= 12 ? "hs12-pro" : "hs16-pro");
  }
  // System size only (e.g. "8 kW"), without the package name
  function systemSizeOf(system) {
    const s = String(system || "");
    const m = s.match(/(\d+(?:\.\d+)?)\s*kWp?\b(?!h)/i);
    return m ? `${m[1]} kW` : s;
  }
  function packageWithSize(rec) {
    const name = packageNameOf(rec);
    const size = systemSizeOf(rec?.system);
    return name ? `${name} · ${size}` : size;
  }
  // Installment terms (6 months · 3 years · 6 years) from the shared package list
  function installmentTermOptions() {
    return (window.HELLO_SOLAR_PACKAGES && window.HELLO_SOLAR_PACKAGES.termOptions) || [6, 36, 72];
  }
  function termText(months) {
    const P = window.HELLO_SOLAR_PACKAGES;
    return P && P.termLabel ? P.termLabel(months) : `${months} months`;
  }
  function paymentTypeOf(app) {
    return db.isFullPaymentApp(app) ? "Full Payment" : "Installment";
  }
  function paymentTypePill(type, extraClass = "") {
    const cls = type === "Full Payment" ? "pay-full" : "pay-installment";
    return `<span class="status-pill ${cls}${extraClass ? " " + extraClass : ""}">${safeText(type)}</span>`;
  }

  // ==================== 2. APPLICATIONS PAGE ====================
  function syncAppTabs() {
    $$("#appFilterChips .chip-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.stage === state.appStageFilter);
    });
  }

  // Direct Installation Engineer scope: Hello Solar Direct / internal installation applications only
  function isEngineerVisibleApp(app) {
    if (!app) return false;
    return isDirectProject(app) || db.getDirectInstallJobs().some(j => j.appId === app.id);
  }

  function renderApplications() {
    const allApps = db.getApplications ? db.getApplications() : db.data.applications;
    const apps = IS_ENGINEER ? allApps.filter(isEngineerVisibleApp) : allApps;

    // Update counts on filter chips
    const countGroup = group => apps.filter(a => stageGroupOf(a.stage) === group).length;
    if ($("#countAppAll")) $("#countAppAll").textContent = apps.length;
    if ($("#countAppCash")) $("#countAppCash").textContent = countGroup("Cash Applications");
    if ($("#countAppMissing")) $("#countAppMissing").textContent = countGroup("Missing Documents");
    if ($("#countAppPendingFinancing")) $("#countAppPendingFinancing").textContent = countGroup("Pending Financing");
    if ($("#countAppPendingInstallation")) $("#countAppPendingInstallation").textContent = countGroup("Pending Installation");
    if ($("#countAppDeclined")) $("#countAppDeclined").textContent = countGroup("Declined");

    // Filter applications
    const filtered = apps.filter(app => {
      const matchStage = state.appStageFilter === "All" || stageGroupOf(app.stage) === state.appStageFilter;
      const matchFinancer = state.appFinancerFilter === "All" ||
        (state.appFinancerFilter === "Not Required"
          ? (app.financer === "Not Required" || (app.paymentType || "").toLowerCase().includes("full"))
          : state.appFinancerFilter === "Pending"
            ? (app.financer === "Pending" || app.financer === "Unassigned")
            : app.financer === state.appFinancerFilter);

      const q = state.appSearchQuery.toLowerCase().trim();
      const matchSearch = !q || (
        (app.id && app.id.toLowerCase().includes(q)) ||
        (app.customer && app.customer.toLowerCase().includes(q)) ||
        (app.location && app.location.toLowerCase().includes(q)) ||
        (app.paymentType && app.paymentType.toLowerCase().includes(q)) ||
        packageNameOf(app).toLowerCase().includes(q) ||
        stageGroupOf(app.stage).toLowerCase().includes(q)
      );

      return matchStage && matchFinancer && matchSearch;
    });

    const tbody = $("#appTableBody");
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:32px; color:var(--muted);">No applications found matching the selected criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(app => {
      const isDirect = isDirectProject(app);
      const isEligible = isEligibleForDirect(app);
      const paymentType = paymentTypeOf(app);
      const stageGroup = stageGroupOf(app.stage);

      // One line per cell: long values are cut with "…" and shown in full on hover
      let actionContent = "";
      if (!IS_ENGINEER && db.isEligibleForHelloSolarFunding(app)) {
        actionContent = `<button class="btn-hs-funding apps-mini-btn" data-hs-funding="${app.id}" title="Accept financing with Hello Solar Funding">Fund</button>`;
      } else if (isEligible && !isDirect) {
        actionContent = `<button class="btn-home-direct apps-mini-btn" data-open-direct-modal="${app.id}" title="Accept for Hello Solar Installation" aria-label="Hello Solar Direct Install">🏠 Direct</button>`;
      }
      const financerFull = db.isHelloSolarFunded(app) ? "Hello Solar Funding" : (app.financer || "Pending");
      const financerHtml = db.isHelloSolarFunded(app)
        ? `<span class="badge-hs-funded" title="Hello Solar Funding">HS Funding</span>`
        : safeText(financerFull.replace(" Financing", "").replace(" Program", ""));
      const installerFull = isDirect ? "Hello Solar Internal Team" : (app.installer || "Unassigned");
      const installerHtml = isDirect
        ? `<span class="badge-hs-install" title="Installed by the Hello Solar team">HS Installation</span>`
        : safeText(installerFull);
      const subLine = `${packageWithSize(app)} • ${pesoCompact(app.amount)}`;

      return `
        <tr>
          <td><span class="record-id">${app.id}</span></td>
          <td title="${safeText(app.location)}">${safeText(app.location)}</td>
          <td title="${safeText(app.customer)} · ${safeText(subLine)}">
            <strong class="app-cust-name">${safeText(app.customer)}</strong>
            <span class="sub-info">${safeText(subLine)}</span>
          </td>
          <td title="${!db.isFullPaymentApp(app) && Number(app.termMonths) > 0 ? safeText(termText(Number(app.termMonths))) : ""}">${paymentTypePill(paymentType)}</td>
          <td><span class="status-pill ${stageGroupClass(stageGroup)}" title="${safeText(stageGroup)}">${safeText(stageGroup)}</span></td>
          <td title="${safeText(financerFull)}">${financerHtml}</td>
          <td title="${safeText(installerFull)}">${installerHtml}</td>
          <td><span class="sub-info" style="margin:0;">${safeText(appUpdatedLabel(app))}</span></td>
          <td class="apps-action-cell">
            <button class="btn btn-secondary btn-sm apps-mini-btn" data-view-app="${app.id}" title="View application details">Details</button>${actionContent}
          </td>
        </tr>
      `;
    }).join("");
  }

  // --- APPLICATION DETAILS TAB SWITCHER ---
  function switchDrawerTab(tabName) {
    state.appDrawerTab = tabName;
    $$("#appDrawerTabs .drawer-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.dtab === tabName);
    });
    $$(".drawer-tab-content").forEach(content => {
      content.classList.toggle("active", content.id === `tabContent${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    });
  }

  // --- APPLICATION DETAILS DRAWER ---
  function openAppDrawer(appId) {
    const app = db.data.applications.find(a => a.id === appId);
    if (!app) return;
    if (IS_ENGINEER && !isEngineerVisibleApp(app)) return;
    renderDrawerEngineerActions(app);

    state.selectedAppId = appId;
    state.appDrawerTab = state.appDrawerTab || "overview";
    switchDrawerTab(state.appDrawerTab);

    const isDirect = isDirectProject(app);
    const isUnassigned = hasNoInstaller(app);
    const isEligibleDirect = isEligibleForDirect(app);
    const isPartnerAssigned = (app.stage === "Approved" || app.stage === "Ready for Installation") && !isUnassigned && !isDirect;
    const linkedJob = db.data.installations.find(j => j.appId === app.id);
    const financerObj = db.data.financers.find(f => f.name.includes(app.financer.slice(0, 7)) || f.id === app.financerId);

    // 1. Header & Stage Pill
    if ($("#drawerAppId")) $("#drawerAppId").textContent = app.id;
    if ($("#drawerStagePill")) {
      $("#drawerStagePill").textContent = app.stage;
      $("#drawerStagePill").className = `status-pill ${getStatusClass(app.stage)}`;
    }
    // Down payment received, shown beside the APP ID
    const dpPill = $("#drawerDpPill");
    if (dpPill) {
      const dpInfo = drawerDownPaymentInfo(app);
      dpPill.style.display = dpInfo ? "" : "none";
      if (dpInfo) {
        dpPill.className = `status-pill ${dpInfo.cls}`;
        dpPill.textContent = dpInfo.text;
        dpPill.title = dpInfo.title;
      }
    }
    if ($("#drawerCustomerName")) $("#drawerCustomerName").textContent = `${app.customer} • ${app.customerId}`;
    if ($("#drawerUpdated")) $("#drawerUpdated").textContent = `Last updated ${appUpdatedLabel(app)}`;

    // 2. Lifecycle Progression (Overview Tab) — same 10 steps for Full Payment and Installment:
    // Down Payment → Account Created → Documents Submission → Pending Finance → Approved Financing →
    // Pending Installer → Installer Accepted → Pending Installation → Ongoing Installation → Completed.
    // Full Payment: "Pending Finance" = full payment receipt waiting for verification, "Approved Financing" = verified.
    const isFullPayment = (app.paymentType || "").toLowerCase().includes("full") || app.financer === "Not Required";
    const stages = ["Down Payment", "Account Created", "Documents Submission", "Pending Finance", "Approved Financing",
      "Pending Installer", "Installer Accepted", "Pending Installation", "Ongoing Installation", "Completed"];
    const at = name => stages.indexOf(name);
    const dpState = db.downPaymentState(app);
    // Installation progress lives on the installation job / installationStatus, not only on app.stage
    const installJob = (db.data.installations || []).find(j => j.appId === app.id && j.status !== "Cancelled" && j.installerType !== "Maintenance");
    const instStatus = String(app.installationStatus || "").toUpperCase();
    const installDone = instStatus === "COMPLETED" || (installJob && installJob.status === "Completed");
    const installing = instStatus === "INSTALLATION_IN_PROGRESS" || app.stage === "In Progress" ||
      (installJob && (["Testing", "Delayed"].includes(installJob.status) || (installJob.status === "In Progress" && Number(installJob.progress) > 0))) ||
      (app.stage === "Installation" && !instStatus && app.installerAcceptance !== "Accepted");
    const installerAccepted = instStatus === "AWAITING_INSTALLATION" || app.installerAcceptance === "Accepted" ||
      app.dispatchStatus === "Accepted" || !!(installJob && installJob.engineerAcceptedAt) ||
      !!(installJob && ["Scheduled", "Ready"].includes(installJob.status) && !hasNoInstaller(app));

    const readyForInstaller = ["Ready for Installation", "Installation"].includes(app.stage);
    // Full Payment balance verified (same rule that clears the job for installers)
    const fullPaymentVerified = isFullPayment && (["Verified / Paid", "Verified", "Paid", "Completed"].includes(app.paymentStatus) ||
      app.receiptVerificationStatus === "Verified");
    const docCountsLc = db.getAppDocumentCounts(app.id);
    const docsMissing = app.stage === "Missing Documents" || docCountsLc.missing.length > 0;
    const agreement = window.HSShared && window.HSShared.agreementFor ? window.HSShared.agreementFor(app) : null;

    let currentStageIndex;
    if (app.stage === "Completed" || installDone) currentStageIndex = at("Completed");
    else if (installing) currentStageIndex = at("Ongoing Installation");
    else if (installerAccepted) currentStageIndex = at("Pending Installation");
    else if (readyForInstaller || fullPaymentVerified) currentStageIndex = at("Pending Installer");
    else if (!isFullPayment && app.stage === "Approved") currentStageIndex = at("Approved Financing");
    else if (docsMissing) currentStageIndex = at("Documents Submission");
    else currentStageIndex = at("Pending Finance"); // Financing Review / Pending Finance / unverified full payment
    if (!app.customerId && currentStageIndex > at("Account Created")) currentStageIndex = at("Account Created");
    // The down payment must be verified before the project can move toward installation
    if (dpState !== "Verified" && currentStageIndex <= at("Pending Installer") && !installerAccepted) {
      currentStageIndex = at("Down Payment");
    }
    // Completed is only ticked once the application itself is marked Completed
    const finished = app.stage === "Completed";
    // Header pill and Current Stage use the Lifecycle step name; a declined application keeps "Declined".
    const lifecycleLabel = app.stage === "Declined" ? "Declined" : stages[currentStageIndex];
    if ($("#drawerStagePill")) {
      $("#drawerStagePill").textContent = lifecycleLabel;
      $("#drawerStagePill").className = `status-pill ${getStatusClass(lifecycleLabel)}`;
    }
    // Full Payment: the system price still owed is shown as a balance, not as the stage.
    // Buy Now terms: the verified down payment is deducted from the total system price.
    const payInfo = isFullPayment && !finished && db.calculatePaymentStatus ? db.calculatePaymentStatus(app) : null;
    const dpCredit = dpState === "Verified" && app.downPaymentStatus ? db.downPaymentAmount(app) : 0;
    const balanceDue = payInfo && payInfo.remainingBalance > 0 ? Math.max(0, payInfo.remainingBalance - dpCredit) : 0;

    const stepState = i => (i < currentStageIndex || (finished && i === currentStageIndex)) ? "done" : (i === currentStageIndex ? "current" : "upcoming");
    // Documents Submission is only ticked when every required document and the signed agreement are complete.
    // When the application already moved past it without them, the step shows "!" instead of ✓.
    const docsIncomplete = docCountsLc.missing.length > 0 || !!(agreement && agreement.status !== "ACCEPTED");
    const docsIssue = docCountsLc.missing.length
      ? `Missing: ${docCountsLc.missing.map(d => d.label || d.name).join(", ")}`
      : "The signed agreement is waiting for review";
    const stepperEl = $("#drawerStepper");
    if (stepperEl) {
      stepperEl.innerHTML = stages.map((stg, i) => {
        let st = stepState(i);
        if (st === "done" && stg === "Documents Submission" && docsIncomplete) st = "warn";
        const cls = st === "done" ? "completed" : (st === "current" ? "active" : (st === "warn" ? "warn" : ""));
        return `
          <div class="step-item ${cls}"${st === "warn" ? ` title="${safeText(docsIssue)}"` : ""}>
            <div class="step-bubble">${st === "done" ? '✓' : (st === "warn" ? '!' : i + 1)}</div>
            <div class="step-label">${stg}</div>
          </div>
        `;
      }).join("");
    }

    // Direct Install Callout banner (Overview tab)
    const calloutEl = $("#drawerDirectInstallCallout");
    if (calloutEl) {
      calloutEl.style.display = isEligibleDirect ? "block" : "none";
    }
    // Hello Solar Funding callout (installment applications waiting for financing)
    const fundCallout = $("#drawerHsFundingCallout");
    if (fundCallout) fundCallout.style.display = !IS_ENGINEER && db.isEligibleForHelloSolarFunding(app) ? "block" : "none";

    // Project strip is not used anymore (its details are in the Application Summary)
    const stripEl = $("#drawerProjectStrip");
    if (stripEl) { stripEl.innerHTML = ""; stripEl.style.display = "none"; }

    // Application Summary — the application's details (not the step status, which the Lifecycle Progression
    // above already shows), grouped in the same order as the lifecycle steps.
    const summaryEl = $("#drawerLifecycleSummary");
    if (summaryEl) {
      const progressRec = db.getInstallationProgress ? db.getInstallationProgress({ appId: app.id }) : null;
      const pkg = packageOf(app);
      const battery = progressRec && progressRec.battery && progressRec.battery.brand
        ? [progressRec.battery.brand, progressRec.battery.model, progressRec.battery.capacityKwh ? `${progressRec.battery.capacityKwh} kWh` : ""].filter(Boolean).join(" ")
        : (app.battery || (pkg && pkg.battery ? `${pkg.battery} (${pkg.name})` : "Pending assessment"));
      const dp = app.downPaymentProof || null;
      const custRec = (db.data.customers || []).find(c => c.id === app.customerId) || {};
      const hasDpReceipt = !!(dp && dp.dataUrl);
      const fmtDay = iso => iso ? formatReadableDate(String(iso).slice(0, 10)) : "—";
      const dash = v => (v === null || v === undefined || v === "") ? "—" : safeText(v);
      const pill = (text, cls) => `<span class="status-pill ${cls}" style="font-size:11px;">${safeText(text)}</span>`;
      const installerName = isDirect ? "Hello Solar Internal Team" : (isUnassigned ? "Not assigned yet" : app.installer);
      const agreementLabel = agreement
        ? ({ NOT_SUBMITTED: "Not submitted", SUBMITTED: "Submitted · for review", ACCEPTED: "Accepted", REUPLOAD_REQUIRED: "Re-upload requested" })[agreement.status] || agreement.status
        : "—";
      const agreementCls = agreement && agreement.status === "ACCEPTED" ? "success" : (agreement && agreement.status === "SUBMITTED" ? "direct" : "warn");
      const agreementActions = agreement && agreement.uploadedAt
        ? ` <button type="button" class="link-btn" data-agreement-view="${safeText(app.id)}" style="margin:0 0 0 6px;">View file</button>`
        : "";
      const financed = ["Approved", "Ready for Installation", "Installation", "In Progress", "Completed"].includes(app.stage);
      const sched = db.getPaymentSchedule ? db.getPaymentSchedule(app.id) : null;
      const term = !isFullPayment && sched && sched.installments ? sched.installments.length : (app.termMonths || null);

      // Key details only, each with its own label, in lifecycle order (empty values are left out)
      const financerText = db.isHelloSolarFunded(app) ? "Hello Solar Funding"
        : (app.financerId || (app.financer && !["Pending", "Unassigned"].includes(app.financer)) ? app.financer : "Not assigned yet");
      const items = [
        ["Down Payment", `${safeText(peso(db.downPaymentAmount(app)))} ${pill(dpState, dpState === "Verified" ? "success" : "warn")}` +
          (hasDpReceipt ? ` <button type="button" class="link-btn" id="btnViewDownPaymentReceipt" style="font-size:12px; margin:0 0 0 4px;">View receipt</button>` : "")],
        ["Customer", dash(app.customer)],
        ["HS ID", dash(db.getAppHsId(app))],
        ["Contact No.", dash(app.phone || app.contactPhone || custRec.phone)],
        ["Documents", `${docCountsLc.submitted} of ${docCountsLc.total} submitted${docCountsLc.verified < docCountsLc.submitted ? ` · ${docCountsLc.submitted - docCountsLc.verified} for review` : ""}`],
        ["Agreement", agreement ? pill(agreementLabel, agreementCls) + agreementActions : "—"],
        ["System", safeText(packageWithSize(app))],
        [isFullPayment ? "System Price" : "Amount Financed", safeText(peso(app.amount))],
        ...(isFullPayment
          ? [["Balance Due", balanceDue ? safeText(peso(balanceDue)) : (fullPaymentVerified ? "Fully paid" : "—")]]
          : [["Financer", safeText(financerText)],
             ["Installment Term", term ? safeText(termText(term)) + (term % 12 === 0 ? ` · ${term} payments` : "") : "—"],
             ["Monthly Payment", app.monthly ? `${safeText(peso(app.monthly))} / month` : "—"]]),
        ["Installer", isUnassigned && !isDirect ? "Not assigned yet" : safeText(installerName)],
        ["Installation Schedule", installJob ? safeText((installJob.schedule || "Pending Schedule").replace(/\s*\(Delayed\)/gi, "")) : "Not scheduled"]
      ].filter(([, v]) => v && v !== "—");
      summaryEl.innerHTML = `<div class="as-grid">${items.map(([k, v]) =>
        `<div class="as-item"><span>${safeText(k)}</span><strong>${v}</strong></div>`).join("")}</div>`;
    }
    if ($("#drawerNotes")) $("#drawerNotes").textContent = app.notes || "No notes entered.";

    // 3. Documents Tab
    // Counts come from the shared APP document record (same record as the Customer and Financer portals)
    const docs = db.getAppDocuments(app.id);
    const docCounts = db.getAppDocumentCounts(app.id);
    const verifiedCount = docCounts.submitted;
    const missingDocs = docCounts.missing;
    const awaitingReview = docCounts.submitted - docCounts.verified;

    if ($("#dtabDocsCount")) $("#dtabDocsCount").textContent = docCounts.label;
    if ($("#docSummaryTitle")) {
      $("#docSummaryTitle").textContent = missingDocs.length > 0
        ? `${verifiedCount} of ${docCounts.total} documents submitted (${missingDocs.length} missing)`
        : (awaitingReview > 0
          ? `${verifiedCount} of ${docCounts.total} documents submitted (${awaitingReview} awaiting review)`
          : `${docCounts.verified} of ${docCounts.total} documents verified & compliant`);
    }
    if ($("#docSummarySub")) {
      $("#docSummarySub").textContent = missingDocs.length > 0
        ? `Missing: ${missingDocs.map(d => d.label || d.name).join(", ")}`
        : (awaitingReview > 0
          ? `Awaiting review: ${docs.filter(d => d.status === "Submitted" && !d.optional).map(d => d.label || d.name).join(", ")}`
          : `All required documents, including the signed agreement, are verified.`);
    }
    if ($("#docCompliancePill")) {
      const pending = missingDocs.length > 0 || awaitingReview > 0;
      $("#docCompliancePill").textContent = pending ? "Pending KYC" : "Verified";
      $("#docCompliancePill").className = `status-pill ${pending ? 'warn' : 'success'}`;
    }

    const docListEl = $("#drawerDocList");
    if (docListEl) {
      // Same layout as the customer's Documents page: the agreement, then the Required Documents (Installment)
      const required = docs.filter(doc => !doc.isAgreement);
      const docCard = doc => {
        const isMiss = (doc.status === "Missing" && !doc.optional) || doc.status === "Rejected";
        const pending = doc.notRequired
          ? `<span style="color:var(--muted);">${safeText(doc.note || "Not required")}${doc.waived ? ` · by ${safeText(doc.waived.by)}` : ""}</span>`
          : doc.optional && doc.status === "Missing"
          ? '<span style="color:var(--muted);">Not needed unless requested</span>'
          : (doc.status === "Verified" ? '<span style="color:var(--muted);">Accepted · no file on record</span>' : '<span style="color:var(--danger); font-weight:700;">Waiting for the customer to upload</span>');
        return `
          <div class="doc-card ${isMiss ? 'missing' : ''}">
            <div class="doc-left">
              <div class="doc-icon">${isMiss ? '⚠' : '📄'}</div>
              <div class="doc-info">
                <h4>${safeText(doc.label || doc.name)}${doc.optional && !doc.notRequired ? ' <span class="doc-optional-tag">If applicable</span>' : ''}${doc.requested ? ' <span class="doc-optional-tag">Requested</span>' : ''}</h4>
                <div class="doc-meta">
                  ${doc.requested && doc.requestNote ? `<span>${safeText(doc.requestNote)}</span><br>` : ''}
                  ${doc.date ? `Uploaded on ${safeText(formatReadableDate(doc.date))} • ` : ''}
                  ${doc.link ? `<a href="${safeText(doc.link)}" target="_blank" rel="noopener">Open in Google Maps ↗</a>` : doc.file ? `<code>${safeText(doc.file)}</code>` : pending}
                  ${doc.note && doc.status === "Rejected" ? `<br><span style="color:var(--danger);">${safeText(doc.note)}</span>` : ''}
                </div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="doc-badge ${doc.optional && doc.status === "Missing" ? "optional" : doc.status.toLowerCase()}">${safeText(doc.statusLabel || doc.status)}</span>
              ${doc.file && !doc.link ? `<button class="btn btn-secondary btn-sm" data-preview-doc="${app.id}:${safeText(doc.name)}">View</button>` : ''}
              ${IS_ENGINEER || !doc.id ? '' : (doc.waived
                ? `<button type="button" class="link-btn doc-mini-action" data-doc-require="${safeText(doc.id)}">Require again</button>`
                : (!doc.optional && doc.status !== "Verified"
                  ? `<button type="button" class="link-btn doc-mini-action" data-doc-waive="${safeText(doc.id)}" data-doc-label="${safeText(doc.label || doc.name)}">Not required</button>` : ''))}
            </div>
          </div>
        `;
      };
      docListEl.innerHTML =
        `<div class="doc-group-title">Agreement</div>` + agreementDocCard(app) +
        `<div class="doc-group-title doc-group-title-row"><span>Required Documents</span>${IS_ENGINEER ? "" : `<button type="button" class="btn btn-secondary btn-sm" data-doc-request="${safeText(app.id)}">+ Request Document</button>`}</div>` +
        (required.length ? required.map(docCard).join("") : `<p class="doc-group-note">No document requests yet.</p>`);
    }

    // 4. Financing Tab
    if ($("#drawerFinancingAmount")) $("#drawerFinancingAmount").textContent = peso(app.amount);
    if ($("#drawerMonthly")) $("#drawerMonthly").textContent = isFullPayment ? "₱0 (Full Payment)" : `${peso(app.monthly)} / mo`;
    if ($("#drawerFinPartnerName")) {
      $("#drawerFinPartnerName").textContent = isFullPayment
        ? "Not Required (Direct Full Payment)"
        : (financerObj ? `${app.financer} (${financerObj.contact})` : app.financer);
    }
    if ($("#drawerFinancingDecision")) {
      let decisionText = "Credit Approved & Term Sheet Active";
      if (isFullPayment) {
        decisionText = app.stage === "Payment Required" ? "Full Payment Required • Awaiting Invoice Settlement" : "Paid in Full • No Financing Required";
      } else if (app.stage === "Financing Review") {
        decisionText = "Application Under Financing Review";
      } else if (app.stage === "Missing Documents") {
        decisionText = "Underwriting On Hold (Incomplete KYC)";
      } else if (app.stage === "Pending Finance") {
        decisionText = "Underwriting Review in Progress";
      } else if (app.stage === "Declined") {
        decisionText = "Declined (Debt Service Ratio Exceeded)";
      }
      $("#drawerFinancingDecision").textContent = decisionText;
    }
    if ($("#drawerFinancingRepayHealth")) {
      $("#drawerFinancingRepayHealth").textContent = isFullPayment
        ? (app.stage === "Payment Required" ? "Payment Required (Direct Invoice)" : "Paid in Full")
        : `${app.paymentStatus} (Repayment Health)`;
    }
    if ($("#drawerFinancingNextDue")) $("#drawerFinancingNextDue").textContent = isFullPayment ? "N/A" : app.nextDue;
    if ($("#drawerFinancingPlan")) {
      $("#drawerFinancingPlan").textContent = isFullPayment
        ? "100% Direct Cash / Full Payment • No Amortization or Interest"
        : `60-Month Clean Energy Solar Loan @ 7.5% fixed APR • Standard Amortization`;
    }
    if ($("#drawerFinancingNotes")) {
      $("#drawerFinancingNotes").textContent = app.notes || (isFullPayment ? "Direct payment application." : "Financer facility verified by system mesh.");
    }

    // 5. Installation Tab
    if ($("#drawerInstallerType")) $("#drawerInstallerType").textContent = isDirect ? "Hello Solar" : installTypeLabel(app.installerType);
    if ($("#drawerInstaller")) $("#drawerInstaller").textContent = isDirect ? "Hello Solar Internal Team" : app.installer;
    if ($("#drawerInstStatusVal")) $("#drawerInstStatusVal").textContent = linkedJob ? installStatusLabel(linkedJob.status) : (isDirect ? "Scheduled" : "Pending Assignment");
    if ($("#drawerInstScheduleVal")) $("#drawerInstScheduleVal").textContent = linkedJob ? linkedJob.schedule : (isDirect ? "Within 3 days (Priority)" : "Not scheduled");
    if ($("#drawerInstSystemVal")) $("#drawerInstSystemVal").textContent = `${packageWithSize(app)} (${app.panels})`;
    if ($("#drawerInstLocationVal")) $("#drawerInstLocationVal").textContent = app.location;

    // Render Installation Tab dynamic management section
    const instMgmtEl = $("#drawerInstManagementSection");
    if (instMgmtEl) {
      if (isDirect) {
        instMgmtEl.innerHTML = `
          <div class="install-option-card highlight">
            <div>
              <div style="font-weight:700; font-size:13.5px; color:var(--accent); margin-bottom:4px;">
                🏠 Hello Solar Installation Project
              </div>
              <p style="margin:0; font-size:12px; color:var(--ink-secondary); line-height:1.45;">
                This project has been accepted for internal delivery and scheduled with <strong>Hello Solar Internal Team</strong>.
              </p>
            </div>
            <button class="btn btn-secondary btn-sm" id="btnDrawerGoInstalls" style="white-space:nowrap;">
              View in Installations →
            </button>
          </div>
        `;
      } else if (isPartnerAssigned) {
        instMgmtEl.innerHTML = `
          <div class="panel" style="padding:16px; margin-bottom:12px; border-color:var(--line);">
            <div style="font-weight:700; font-size:13px; margin-bottom:6px;">Partner Installer Execution</div>
            <p style="font-size:12px; color:var(--ink-secondary); margin:0 0 12px; line-height:1.45;">
              Currently assigned to <strong>${app.installer}</strong>. Direct installation is protected from accidental reassignment on the table.
            </p>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" id="btnTabReassignDirect">
                <span>🏠</span> Reassign to Hello Solar Installation...
              </button>
              <button class="btn btn-secondary btn-sm" id="btnTabChangePartner">
                Change Partner Installer...
              </button>
            </div>
          </div>
        `;
      } else if (isEligibleDirect) {
        instMgmtEl.innerHTML = `
          <div class="panel" style="padding:16px; margin-bottom:12px;">
            <div style="font-weight:700; font-size:13px; margin-bottom:6px;">Select Installation Path</div>
            <p style="font-size:12px; color:var(--muted); margin:0 0 14px; line-height:1.45;">
              Application is approved and ready for dispatch. Choose between Hello Solar Internal Team or a regional partner installer:
            </p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div class="install-option-card highlight" style="flex-direction:column; justify-content:space-between; margin:0;">
                <div>
                  <div style="font-weight:700; font-size:13px; color:var(--accent); margin-bottom:4px;">🏠 Hello Solar Installation</div>
                  <p style="font-size:11.5px; color:var(--ink-secondary); margin:0 0 10px; line-height:1.4;">
                    Installed by the Hello Solar Internal Team.
                  </p>
                </div>
                <button class="btn btn-primary btn-sm" id="btnTabDirectAccept" style="width:100%;">
                  Accept Hello Solar Installation
                </button>
              </div>

              <div class="install-option-card" style="flex-direction:column; justify-content:space-between; margin:0;">
                <div>
                  <div style="font-weight:700; font-size:13px; margin-bottom:4px;">Partner Installer</div>
                  <p style="font-size:11.5px; color:var(--muted); margin:0 0 10px; line-height:1.4;">
                    Dispatch to accredited regional partner contractor network.
                  </p>
                </div>
                <button class="btn btn-secondary btn-sm" id="btnTabAssignPartner" style="width:100%;">
                  Assign Partner Installer...
                </button>
              </div>
            </div>
          </div>
        `;
      } else {
        instMgmtEl.innerHTML = `
          <div style="background:var(--bg); border:1px solid var(--line); border-radius:var(--radius-md); padding:16px; text-align:center; color:var(--muted); font-size:12.5px;">
            🔒 Installation assignment unlocks once the application reaches <strong>Pending Installation</strong>. Current status: <strong>${safeText(stageGroupOf(app.stage))}</strong>.
          </div>
        `;
      }
    }

    // Keep #drawerReassignSection synchronized for tests
    const reassignEl = $("#drawerReassignSection");
    if (reassignEl) {
      reassignEl.style.display = isPartnerAssigned ? "block" : "none";
    }

    // 6. Activity Tab
    const actTimelineEl = $("#drawerActivityTimeline");
    if (actTimelineEl) {
      const appActs = db.getAppActivity(app.id);
      if (!appActs.length) {
        actTimelineEl.innerHTML = `<div style="color:var(--muted); font-size:12px; padding:12px 0;">No recorded events yet.</div>`;
      } else {
        actTimelineEl.innerHTML = appActs.map(item => `
          <div class="timeline-node">
            <div class="timeline-meta">
              <span class="record-tag">${calculateRelativeTime(item.timestamp || item.exactTime) || item.exactTime || item.time || "Recent"}</span>
              <span>•</span>
              <strong style="color:var(--ink);">${item.user || item.role}</strong>
            </div>
            <div class="timeline-title">${item.action}</div>
          </div>
        `).join("");
      }
      if ($("#dtabActCount")) $("#dtabActCount").textContent = appActs.length;
    }

    // 7. Context-Sensitive Footer Actions
    const footActionsEl = $("#drawerContextActions");
    if (footActionsEl) {
      let footHtml = "";
      if (app.stage === "Missing Documents") {
        footHtml = `
          <button class="btn btn-primary btn-sm" id="btnDrawerReviewDocs">
            Review Documents →
          </button>
        `;
      } else if (app.stage === "Pending Finance") {
        footHtml = `
          <button class="btn btn-primary btn-sm" id="btnDrawerApproveApp">
            Approve Application
          </button>
          <button class="btn btn-secondary btn-sm" id="btnDrawerDeclineApp">
            Decline
          </button>
        `;
      } else if (isEligibleDirect) {
        footHtml = `
          <button class="btn btn-primary btn-sm" id="btnDrawerFootDirect">
            <span>🏠</span> HS Installation
          </button>
          <button class="btn btn-secondary btn-sm" id="btnDrawerFootPartner">
            Assign Partner
          </button>
        `;
      } else if (isPartnerAssigned) {
        footHtml = `
          <button class="btn btn-primary btn-sm" id="btnDrawerFootReassign">
            <span>🏠</span> Reassign Direct
          </button>
        `;
      } else if (isDirect) {
        footHtml = `
          <span class="badge-direct-installed">🏠 Hello Solar Installation Active</span>
        `;
      }
      if (!IS_ENGINEER && db.downPaymentState(app) !== "Verified") {
        footHtml = `
          <button class="btn btn-primary btn-sm" id="btnDrawerVerifyDownPayment">Verify Down Payment</button>
        ` + footHtml;
      }
      if (!IS_ENGINEER && db.isEligibleForHelloSolarFunding(app)) {
        footHtml = `<button class="btn btn-secondary btn-sm" id="btnDrawerFootHsFunding">Hello Solar Funding</button>` + footHtml;
      }
      const reviewStages = ["Submitted", "Financing Review", "Pending Finance", "Missing Documents"];
      if (!db.isFullPaymentApp(app) && app.stage !== "Declined" && (!app.financerId || reviewStages.includes(app.stage))) {
        footHtml = `
          <button class="btn ${app.financerId ? "btn-secondary" : "btn-primary"} btn-sm" id="btnDrawerAssignFinancer">
            ${app.financerId ? "Change Financer" : "Assign Financer"}
          </button>
        ` + footHtml;
      }
      footActionsEl.innerHTML = footHtml;
    }

    $("#appDrawerOverlay")?.classList.add("open");
  }

  // --- HELLO SOLAR DIRECT INSTALLATION CONFIRMATION MODAL ---
  function openDirectInstallModal(appId) {
    if (IS_ENGINEER) return;
    const app = db.data.applications.find(a => a.id === appId);
    if (!app) return;

    // Check capacity limit configured in Settings
    const limit = Number(db.data.settings?.maxDirectProjects) || 12;
    const designatedTeam = db.data.settings?.directInstallTeam || "Hello Solar Internal Team";
    const activeDirectCount = db.data.installations.filter(j =>
      (j.installerType === "Hello Solar Direct" || j.installer === designatedTeam || j.installer === "Hello Solar Internal Team") &&
      !["Completed", "Cancelled"].includes(j.status)
    ).length;

    if (activeDirectCount >= limit) {
      showToast(`Direct installation capacity reached (${activeDirectCount}/${limit} active projects). Complete existing direct projects before accepting more.`, "warn", "⚠️");
      return;
    }

    state.selectedAppId = appId;

    // If Require Confirmation is turned off in Settings, directly confirm without modal popup
    const requireConfirmation = db.data.settings?.directInstallConfirmation !== false;
    if (!requireConfirmation) {
      confirmDirectInstall();
      return;
    }

    if ($("#dimAppId")) $("#dimAppId").textContent = app.id;
    if ($("#dimCustomer")) $("#dimCustomer").textContent = app.customer;
    if ($("#dimLocation")) $("#dimLocation").textContent = app.location;
    if ($("#dimSystem")) $("#dimSystem").textContent = app.system;
    if ($("#dimStatus")) $("#dimStatus").textContent = stageGroupOf(app.stage);
    if ($("#dimFinancer")) $("#dimFinancer").textContent = `${app.financer} (${peso(app.amount)})`;
    if ($("#dimAssignedTeam")) $("#dimAssignedTeam").textContent = designatedTeam;
    if ($("#dimCapacityUsage")) $("#dimCapacityUsage").textContent = `${activeDirectCount} of ${limit} slots currently in use`;

    $("#directInstallModal")?.classList.add("open");
  }

  function confirmDirectInstall() {
    const appId = state.selectedAppId;
    if (!appId) return;

    const result = db.acceptDirectInstallation(appId);
    if (result.success) {
      $("#directInstallModal")?.classList.remove("open");

      const team = db.data.settings?.directInstallTeam || "Hello Solar Internal Team";
      showToast(`Application ${appId} accepted for Hello Solar Installation. Assigned to ${team}.`, "direct", "🏠");

      // Rerender page and update open drawer in place
      renderCurrentPage();
      if ($("#appDrawerOverlay")?.classList.contains("open")) {
        openAppDrawer(appId);
      }
    } else {
      showToast(result.message || "Could not accept the Hello Solar installation.", "danger", "⚠️");
    }
  }

  // --- SIGNED AGREEMENT (uploaded by the customer from Documents) — shown first in Details › Documents ---
  function agreementDocCard(app) {
    const ag = window.HSShared && window.HSShared.agreementFor ? window.HSShared.agreementFor(app) : null;
    if (!ag) return "";
    const uploaded = !!ag.uploadedAt;
    const label = { NOT_SUBMITTED: "Missing", SUBMITTED: "Submitted", ACCEPTED: "Verified", REUPLOAD_REQUIRED: "Rejected" }[ag.status] || "Missing";
    const badgeText = { NOT_SUBMITTED: "Not Submitted", SUBMITTED: "Submitted", ACCEPTED: "Accepted", REUPLOAD_REQUIRED: "Re-upload Required" }[ag.status] || "Not Submitted";
    const sizeText = ag.fileSize ? (ag.fileSize >= 1048576 ? `${(ag.fileSize / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(ag.fileSize / 1024))} KB`) : "";
    const meta = uploaded
      ? `Uploaded on ${safeText(formatReadableDate(String(ag.uploadedAt).slice(0, 10)))} • <code>${safeText(ag.fileName || "signed agreement")}</code>${sizeText ? ` • ${sizeText}` : ""}` +
        (ag.status === "REUPLOAD_REQUIRED" && ag.note ? `<br><span style="color:var(--danger);">Re-upload requested: ${safeText(ag.note)}</span>` : "")
      : `<span style="color:var(--danger); font-weight:700;">Waiting for the customer to upload the signed ${safeText(ag.title)}</span>`;
    const actions = uploaded
      ? `<button class="btn btn-secondary btn-sm" data-agreement-view="${safeText(app.id)}">View</button>` +
        (!IS_ENGINEER && ag.status === "SUBMITTED"
          ? ` <button class="btn btn-primary btn-sm" data-agreement-accept="${safeText(app.id)}">Accept</button> <button class="btn btn-secondary btn-sm" data-agreement-reupload="${safeText(app.id)}">Ask to Re-upload</button>`
          : "")
      : "";
    return `
      <div class="doc-card agreement-doc-card ${uploaded ? "" : "missing"}">
        <div class="doc-left">
          <div class="doc-icon">${uploaded ? "✍️" : "⚠"}</div>
          <div class="doc-info">
            <h4>${safeText(ag.title)} <span class="doc-optional-tag">Signed copy</span></h4>
            <div class="doc-meta">${meta}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          <span class="doc-badge ${label.toLowerCase()}">${badgeText}</span>
          ${actions}
        </div>
      </div>`;
  }

  // --- HELLO SOLAR FUNDING (Super Admin accepts the financing directly) ---
  function openHsFundingModal(appId) {
    if (IS_ENGINEER) return;
    const app = db.data.applications.find(a => a.id === appId);
    if (!app) return;
    if (!db.isEligibleForHelloSolarFunding(app)) {
      showToast(`${appId} is not waiting for financing.`, "warn", "⚠");
      return;
    }
    state.selectedAppId = appId;
    const set = (id, v) => { if ($(id)) $(id).textContent = v; };
    set("#hsfAppId", app.id);
    set("#hsfCustomer", app.customer);
    set("#hsfSystem", packageWithSize(app));
    set("#hsfAmount", peso(app.amount));
    set("#hsfMonthly", app.monthly ? `${peso(app.monthly)} / mo` : "—");
    set("#hsfFinancer", app.financerId ? app.financer : "Not assigned");
    if ($("#hsfError")) $("#hsfError").style.display = "none";
    // Funding needs every required document and the Accepted signed agreement
    const gate = db.documentsGate ? db.documentsGate(app) : { ok: true, missing: [] };
    const warn = $("#hsfDocsWarn");
    if (warn) {
      warn.style.display = gate.ok ? "none" : "block";
      warn.textContent = gate.ok ? "" : `Cannot fund yet. Still needed: ${gate.missing.join(", ")}.`;
    }
    if ($("#btnConfirmHsFunding")) $("#btnConfirmHsFunding").disabled = !gate.ok;
    $("#hsFundingModal")?.classList.add("open");
  }

  function confirmHsFunding() {
    const appId = state.selectedAppId;
    if (!appId) return;
    const res = db.acceptHelloSolarFunding(appId, { adminUser: SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)" });
    if (!res.success) {
      if ($("#hsfError")) { $("#hsfError").textContent = res.error; $("#hsfError").style.display = "block"; }
      return;
    }
    $("#hsFundingModal")?.classList.remove("open");
    showToast(`${appId} accepted for Hello Solar Funding. Financing approved.`, "success", "₱");
    renderCurrentPage();
    if ($("#appDrawerOverlay")?.classList.contains("open")) openAppDrawer(appId);
  }

  // --- REQUEST A DOCUMENT / MARK A DOCUMENT NOT REQUIRED (Details › Documents) ---
  function openDocRequestModal(mode, appId, docId, docLabel) {
    state.docRequest = { mode, appId, docId };
    const isRequest = mode === "request";
    const set = (id, v) => { if ($(id)) $(id).textContent = v; };
    set("#drqTitle", isRequest ? "Request a Document" : "Mark as Not Required");
    set("#drqSub", isRequest
      ? `${appId} · The customer sees it on their Documents page and gets a notification.`
      : `${appId} · ${docLabel}. The customer sees that it is not needed, with your reason.`);
    if ($("#drqNameWrap")) $("#drqNameWrap").style.display = isRequest ? "" : "none";
    set("#drqNoteLabel", isRequest ? "What should the customer upload? (optional)" : "Reason (the customer will see it)");
    if ($("#drqName")) $("#drqName").value = "";
    if ($("#drqNote")) {
      $("#drqNote").value = "";
      $("#drqNote").placeholder = isRequest ? "e.g. Your latest Certificate of Employment, signed by HR" : "e.g. Not needed — you are the registered owner on the title";
    }
    set("#btnConfirmDocRequest", isRequest ? "Send Request" : "Mark Not Required");
    if ($("#drqError")) $("#drqError").style.display = "none";
    $("#docRequestModal")?.classList.add("open");
    setTimeout(() => (isRequest ? $("#drqName") : $("#drqNote"))?.focus(), 50);
  }

  function confirmDocRequest() {
    const r = state.docRequest;
    if (!r || !window.HSShared) return;
    const actor = SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)";
    const res = r.mode === "request"
      ? window.HSShared.requestDocument(r.appId, { name: $("#drqName")?.value, note: $("#drqNote")?.value }, actor)
      : window.HSShared.setDocumentNotRequired(r.appId, r.docId, $("#drqNote")?.value, actor);
    if (!res || res.ok === false) {
      if ($("#drqError")) { $("#drqError").textContent = (res && res.error) || "Could not save."; $("#drqError").style.display = "block"; }
      return;
    }
    $("#docRequestModal")?.classList.remove("open");
    db.data = db.load();
    showToast(r.mode === "request" ? `Document requested from the customer · ${r.appId}` : `Marked as not required · ${r.appId}`, "success", "✓");
    reopenDrawerDocuments(r.appId);
    renderCurrentPage();
  }

  function reopenDrawerDocuments(appId) {
    openAppDrawer(appId);
    switchDrawerTab("documents");
  }

  function requireDocumentAgain(appId, docId) {
    const actor = SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)";
    const res = window.HSShared && window.HSShared.setDocumentNotRequired(appId, docId, null, actor);
    if (!res || res.ok === false) { showToast((res && res.error) || "Could not update the document.", "danger", "⚠"); return; }
    db.data = db.load();
    showToast(`The customer needs to upload it again · ${appId}`, "success", "✓");
    reopenDrawerDocuments(appId);
    renderCurrentPage();
  }

  // --- PARTNER INSTALLER ASSIGNMENT MODAL ---
  function openAssignPartnerModal(appId) {
    const app = db.data.applications.find(a => a.id === appId);
    if (!app) return;
    state.selectedAppId = appId;

    if ($("#apmAppId")) $("#apmAppId").textContent = app.id;
    if ($("#apmCustomer")) $("#apmCustomer").textContent = app.customer;
    if ($("#apmLocation")) $("#apmLocation").textContent = app.location;
    if ($("#apmSystem")) $("#apmSystem").textContent = app.system;

    // Active partner installer accounts from Accounts → Installers (no Direct/internal team or engineers)
    const options = db.getAssignablePartnerInstallers();
    const select = $("#apmInstallerSelect");
    if (select) {
      select.innerHTML = options.map(i => {
        const rating = i.rating != null ? ` • Rating ${safeText(i.rating)} ★` : "";
        return `<option value="${safeText(i.id)}"${i.id === app.assignedInstallerId ? " selected" : ""}>${safeText(i.name)} (${safeText(i.id)}${rating} • ${Number(i.activeJobs) || 0} Active)</option>`;
      }).join("");
      select.disabled = !options.length;
    }
    if ($("#apmEmptyNote")) $("#apmEmptyNote").style.display = options.length ? "none" : "block";
    if ($("#btnConfirmAssignPartner")) $("#btnConfirmAssignPartner").disabled = !options.length;

    $("#assignPartnerModal")?.classList.add("open");
  }

  function confirmAssignPartner() {
    const appId = state.selectedAppId;
    const installerId = $("#apmInstallerSelect")?.value;
    if (!appId || !installerId) return;

    const schedule = $("#apmScheduleInput")?.value || "Within 5 business days";

    const res = db.assignPartnerInstaller(appId, installerId, schedule);
    if (!res.success) {
      showToast(res.error || "Partner installer could not be assigned.", "danger", "⚠");
      return;
    }
    window.HELLO_SOLAR_DATA = db.data;
    $("#assignPartnerModal")?.classList.remove("open");
    showToast(`Partner installer "${res.installer.name}" (${res.installer.id}) successfully assigned to ${appId}.`, "success", "✓");
    renderCurrentPage();
    if ($("#appDrawerOverlay")?.classList.contains("open")) {
      openAppDrawer(appId);
    }
  }

  // --- FINANCER ASSIGNMENT MODAL (installment applications) ---
  function openAssignFinancerModal(appId) {
    const app = db.data.applications.find(a => a.id === appId);
    if (!app) return;
    state.selectedAppId = appId;
    if ($("#afmAppId")) $("#afmAppId").textContent = app.id;
    if ($("#afmCustomer")) $("#afmCustomer").textContent = app.customer;
    if ($("#afmAmount")) $("#afmAmount").textContent = peso(app.amount);
    if ($("#afmCurrent")) $("#afmCurrent").textContent = app.financerId ? `${app.financer} (${app.financerId})` : "Not assigned";
    const options = db.getAssignableFinancers();
    const select = $("#afmFinancerSelect");
    if (select) {
      select.innerHTML = options.map(f => `<option value="${safeText(f.id)}"${f.id === app.financerId ? " selected" : ""}>${safeText(f.name)} (${safeText(f.id)})</option>`).join("");
      select.disabled = !options.length;
    }
    if ($("#afmEmptyNote")) $("#afmEmptyNote").style.display = options.length ? "none" : "block";
    if ($("#btnConfirmAssignFinancer")) $("#btnConfirmAssignFinancer").disabled = !options.length;
    $("#assignFinancerModal")?.classList.add("open");
  }

  function confirmAssignFinancer() {
    const appId = state.selectedAppId;
    const financerId = $("#afmFinancerSelect")?.value;
    if (!appId || !financerId) return;
    const res = db.assignFinancer(appId, financerId, { adminUser: "ADMIN (Limuel)" });
    if (!res.success) {
      showToast(res.error || "Financer could not be assigned.", "danger", "⚠");
      return;
    }
    window.HELLO_SOLAR_DATA = db.data;
    $("#assignFinancerModal")?.classList.remove("open");
    showToast(`${appId} assigned to ${res.financer.name} for financing review.`, "success", "✓");
    renderCurrentPage();
    if ($("#appDrawerOverlay")?.classList.contains("open")) openAppDrawer(appId);
  }

  // --- DOCUMENT PREVIEW MODAL ---
  function openDocPreviewModal(appId, docName) {
    const app = db.data.applications.find(a => a.id === appId);
    if (!app) return;
    const docs = db.getAppDocuments(appId);
    const doc = docs.find(d => d.name === docName);

    state.dpmDocName = docName;
    if ($("#dpmTitle")) $("#dpmTitle").textContent = doc ? (doc.label || docName) : docName;
    if ($("#dpmFileName")) $("#dpmFileName").textContent = doc ? doc.file || "No file uploaded" : "document.pdf";
    if ($("#dpmFileMeta")) $("#dpmFileMeta").textContent = doc && doc.date ? `Uploaded on ${doc.date} • Verified KYC` : "Awaiting applicant upload";
    if ($("#dpmStatus")) $("#dpmStatus").textContent = doc ? (doc.statusLabel || doc.status) : "Pending";
    if ($("#dpmAppId")) $("#dpmAppId").textContent = `${app.id} (${app.customer})`;
    if ($("#dpmFileMeta") && doc && doc.date) $("#dpmFileMeta").textContent = `Uploaded on ${formatReadableDate(doc.date)}`;

    // The actual uploaded file (shared APP document record), with a download link
    let box = $("#dpmFilePreview");
    if (!box && $("#dpmFileName")) {
      box = document.createElement("div");
      box.id = "dpmFilePreview";
      box.className = "dpm-file-preview";
      $("#dpmFileName").closest("div").after(box);
    }
    if (box) {
      const rec = window.HSShared && window.HSShared.documentsFor ? window.HSShared.documentsFor(appId) : null;
      const sharedDoc = rec ? (rec.documents || []).find(d => d.name === docName) : null;
      const dataUrl = sharedDoc && sharedDoc.fileData;
      const mime = (String(dataUrl || "").match(/^data:([^;,]+)/) || [])[1] || "";
      box.innerHTML = !dataUrl ? ""
        : (mime.startsWith("image/") ? `<img src="${dataUrl}" alt="${safeText(docName)}">`
          : (mime === "application/pdf" ? `<iframe src="${dataUrl}" title="${safeText(docName)}"></iframe>` : "")) +
          `<a class="btn btn-secondary btn-sm" href="${dataUrl}" download="${safeText(sharedDoc.fileName || "document")}">Download file</a>`;
      box.style.display = dataUrl ? "" : "none";
    }

    $("#docPreviewModal")?.classList.add("open");
  }

  // ==================== 3. INSTALLATIONS PAGE ====================
  // Installation progress names (stored values stay the same: Ready = Accepted, Testing = Testing & Commissioning)
  const INSTALL_STATUS_LABEL = { Ready: "Accepted", Testing: "Testing & Commissioning" };
  const installStatusLabel = status => INSTALL_STATUS_LABEL[status] || status || "—";
  const installTypeLabel = type => type === "Hello Solar Direct" ? "Hello Solar" : (type || "—");
  function syncInstallTabs() {
    $$("#installFilterTabs .chip-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.type === state.installTypeFilter);
    });
  }

  // Maintenance jobs live on the Maintenance page only (not under Installations)
  function isInstallationWork(job) { return !!job && job.installerType !== "Maintenance"; }

  function renderInstallations() {
    const installs = (IS_ENGINEER ? db.getDirectInstallJobs() : db.data.installations).filter(isInstallationWork);

    const filtered = installs.filter(job => {
      // Type filter
      let matchType = true;
      if (state.installTypeFilter === "Completed") {
        matchType = job.status === "Completed";
      } else if (state.installTypeFilter !== "All") {
        matchType = job.installerType === state.installTypeFilter;
      }

      // Status filter
      let matchStatus = state.installStatusFilter === "All" || job.status === state.installStatusFilter;

      // Search filter
      const q = state.installSearchQuery.toLowerCase().trim();
      let matchSearch = !q || (
        job.id.toLowerCase().includes(q) ||
        (job.appId && job.appId.toLowerCase().includes(q)) ||
        (job.customer && job.customer.toLowerCase().includes(q)) ||
        (job.location && job.location.toLowerCase().includes(q)) ||
        (job.installer && job.installer.toLowerCase().includes(q))
      );

      return matchType && matchStatus && matchSearch;
    });

    // Completed projects always at the bottom of the list (stable order otherwise)
    filtered.sort((a, b) => (a.status === "Completed") - (b.status === "Completed"));

    const tbody = $("#installTableBody");
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--muted);">No installation projects matching the filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(job => {
      const isDirect = job.installerType === "Hello Solar Direct";
      const typeDisplay = isDirect ? "🏠 Hello Solar" : job.installerType;
      const typePillClass = isDirect ? "direct" : "neutral";

      const isLeadAssigned = job.leadTech &&
        job.leadTech !== "Hello Solar Internal Team" &&
        job.leadTech !== "Field Operations Team" &&
        job.leadTech !== "Field Crew" &&
        job.leadTech !== "Unassigned";
      const leadDisplay = isLeadAssigned ? job.leadTech : "Unassigned";

      const isCompleted = job.status === "Completed";
      let actionBtnText = isCompleted ? "View Details" : "Inspect / Update";
      if (IS_ENGINEER) {
        const dState = db.getDirectJobState(job);
        actionBtnText = dState === "pending" ? "Review & Accept" : (["completed", "active"].includes(dState) ? "View Progress" : "Update Progress");
      }
      const schedDisplay = (job.schedule || "Pending Schedule").replace(/\s*\(Delayed\)/gi, "").trim();
      // A scheduled job whose date already passed (still not started) is flagged
      const schedTime = Date.parse(schedDisplay.replace(/\s*·.*$/, ""));
      const pastSchedule = ["Scheduled", "Ready"].includes(job.status) && Number.isFinite(schedTime) && schedTime < new Date().setHours(0, 0, 0, 0);

      return `
        <tr>
          <td>
            <span class="record-id">${job.id}</span>
            <span class="sub-info">${job.appId || 'Direct'}</span>
          </td>
          <td>${job.location}</td>
          <td><strong>${safeText(packageWithSize(job))}</strong></td>
          <td>
            <strong>${job.installer}</strong>
            <span class="sub-info">Lead: ${leadDisplay}</span>
          </td>
          <td>
            <span class="status-pill ${typePillClass}">
              ${typeDisplay}
            </span>
          </td>
          <td>
            <span class="status-pill ${getStatusClass(job.status === "Ready" ? "Approved" : job.status)}">${safeText(installStatusLabel(job.status))}</span>
          </td>
          <td>
            <span style="font-size:12px; font-weight:600;">${safeText(schedDisplay)}</span>
            ${pastSchedule ? `<span class="sub-info" style="color:#B91C1C; font-weight:700;">Date passed · update the schedule</span>` : ""}
          </td>
          <td style="text-align: right;">
            <button class="btn btn-secondary btn-sm" data-update-job="${job.id}">${actionBtnText}</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // --- INSPECT / UPDATE MODAL WORKSPACE (Overview | Schedule | Progress | Activity) ---
  function switchInstallModalTab(tabKey) {
    $$("#installModalTabs .modal-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.imtab === tabKey);
    });
    $$("#installModal .modal-tab-content").forEach(content => {
      content.classList.toggle("active", content.id === `imTabContent${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
    });
  }

  function updateInstallModalStepper(status) {
    const steps = ["Ready", "Scheduled", "In Progress", "Testing", "Completed"];
    let activeIdx = steps.indexOf(status);
    if (status === "Delayed") {
      activeIdx = 2; // In Progress stage delayed
    }

    $$("#imProgressStepper .step-item").forEach((item, idx) => {
      item.classList.remove("active", "completed");
      if (status === "Delayed") {
        if (idx < activeIdx) item.classList.add("completed");
      } else if (status === "Completed") {
        item.classList.add("completed");
      } else {
        if (activeIdx >= 0) {
          if (idx < activeIdx) item.classList.add("completed");
          else if (idx === activeIdx) item.classList.add("active");
        }
      }
    });

    const isDelayed = status === "Delayed";
    if ($("#imDelayedAlert")) $("#imDelayedAlert").style.display = isDelayed ? "block" : "none";
    if ($("#imDelayGroup")) $("#imDelayGroup").style.display = isDelayed ? "block" : "none";
  }

  function openInstallModal(jobId) {
    const job = db.data.installations.find(j => j.id === jobId);
    if (!job) return;
    if (IS_ENGINEER) {
      if (job.installerType === "Hello Solar Direct") openDirectEngineerModal(jobId);
      return;
    }
    renderInstallProgressMonitor(job);

    state.selectedJobId = jobId;
    const isCompleted = job.status === "Completed";
    const isDelayed = job.status === "Delayed";
    const isMaintenance = job.installerType === "Maintenance";
    const isDirect = job.installerType === "Hello Solar Direct";

    const isLeadAssigned = job.leadTech &&
      job.leadTech !== "Hello Solar Internal Team" &&
      job.leadTech !== "Field Operations Team" &&
      job.leadTech !== "Field Crew" &&
      job.leadTech !== "Unassigned";
    const leadDisplay = isLeadAssigned ? job.leadTech : "Unassigned";

    // Switch to Overview tab by default
    switchInstallModalTab("overview");

    // Header
    if ($("#imEyebrow")) {
      if (isCompleted) {
        $("#imEyebrow").textContent = "OPERATIONS / COMPLETED PROJECT";
      } else if (isMaintenance) {
        $("#imEyebrow").textContent = "OPERATIONS / MAINTENANCE";
      } else {
        $("#imEyebrow").textContent = `OPERATIONS / ${installTypeLabel(job.installerType).toUpperCase()}`;
      }
    }
    if ($("#imTitle")) {
      $("#imTitle").textContent = `${job.id} • ${job.customer}${isCompleted ? " (Completed)" : ""}`;
    }
    if ($("#imJobId")) $("#imJobId").value = job.id;

    // 1. Overview Tab
    if ($("#imMaintenanceBanner")) $("#imMaintenanceBanner").style.display = isMaintenance ? "block" : "none";
    if ($("#imCompletedBanner")) $("#imCompletedBanner").style.display = isCompleted ? "block" : "none";

    if ($("#imOverviewJobId")) $("#imOverviewJobId").textContent = job.id;
    if ($("#imOverviewAppId")) $("#imOverviewAppId").textContent = job.appId || "Direct Record";
    if ($("#imOverviewCustomer")) $("#imOverviewCustomer").textContent = job.customer;
    if ($("#imOverviewLocation")) $("#imOverviewLocation").textContent = job.location;
    if ($("#imOverviewSystem")) $("#imOverviewSystem").textContent = packageWithSize(job);
    if ($("#imOverviewType")) {
      $("#imOverviewType").textContent = isDirect ? "🏠 Hello Solar" : (isMaintenance ? "🔧 Maintenance & Service" : job.installerType);
    }
    if ($("#imOverviewInstaller")) $("#imOverviewInstaller").textContent = job.installer;
    if ($("#imOverviewStatusPill")) {
      const pill = $("#imOverviewStatusPill");
      pill.textContent = installStatusLabel(job.status);
      pill.className = `status-pill ${getStatusClass(job.status === "Ready" ? "Approved" : job.status)}`;
    }
    if ($("#imOverviewLeadTech")) $("#imOverviewLeadTech").textContent = leadDisplay;
    if ($("#imOverviewCompletionRow")) {
      $("#imOverviewCompletionRow").style.display = isCompleted ? "flex" : "none";
    }
    if ($("#imOverviewCompletionDate")) {
      $("#imOverviewCompletionDate").textContent = job.completedDate || job.schedule || "Sep 14, 2026";
    }
    if ($("#imOverviewNotes")) {
      $("#imOverviewNotes").textContent = job.notes || (isMaintenance ? "Preventive system check, thermal imaging, and string inverter calibration." : "Project in standard operational monitoring.");
    }

    // Delay Reason categorization & display
    let delayCategory = "Permit Approval";
    let delayDetail = "";
    if (job.delayReason) {
      if (job.delayReason.includes("—")) {
        const parts = job.delayReason.split("—");
        delayCategory = parts[0].trim();
        delayDetail = parts[1].trim();
      } else {
        delayCategory = job.delayReason.trim();
      }
    } else if (job.notes && job.notes.includes("Delayed")) {
      delayDetail = job.notes;
    }

    // Overview tab Delay Reason Banner
    if ($("#imOverviewDelayBanner")) {
      $("#imOverviewDelayBanner").style.display = (!isCompleted && isDelayed) ? "block" : "none";
    }
    if ($("#imOverviewDelayCategory")) $("#imOverviewDelayCategory").textContent = delayCategory;
    if ($("#imOverviewDelayText")) {
      $("#imOverviewDelayText").textContent = delayDetail || job.notes || `Installation delayed pending ${delayCategory.toLowerCase()}.`;
    }

    // 2. Schedule Tab
    const schedDisplay = (job.schedule || "Pending Schedule").replace(/\s*\(Delayed\)/gi, "").trim();
    if ($("#imCurrentScheduleText")) {
      $("#imCurrentScheduleText").textContent = isCompleted
        ? `Completed on ${job.completedDate || schedDisplay}`
        : schedDisplay;
    }
    if ($("#imScheduleInput")) {
      $("#imScheduleInput").value = schedDisplay;
      $("#imScheduleInput").disabled = isCompleted;
      $("#imScheduleInput").readOnly = isCompleted;
    }
    if ($("#imRescheduleDate")) {
      $("#imRescheduleDate").value = "";
      $("#imRescheduleDate").disabled = isCompleted;
    }
    if ($("#imRescheduleTime")) {
      $("#imRescheduleTime").value = "09:00 AM";
      $("#imRescheduleTime").disabled = isCompleted;
    }
    if ($("#imLeadTechSelect")) {
      $("#imLeadTechSelect").value = isLeadAssigned ? job.leadTech : "Unassigned";
      $("#imLeadTechSelect").disabled = isCompleted;
    }

    // 3. Progress Tab
    if ($("#imStatusSelect")) {
      $("#imStatusSelect").value = job.status;
      $("#imStatusSelect").disabled = isCompleted;
    }

    if ($("#imDelayedCategoryBadge")) $("#imDelayedCategoryBadge").textContent = delayCategory;
    if ($("#imDelayedReasonText")) $("#imDelayedReasonText").textContent = delayDetail || job.notes || delayCategory;
    if ($("#imDelayReasonSelect")) {
      $("#imDelayReasonSelect").value = ["Permit Approval", "Weather", "Equipment Availability", "Customer Reschedule", "Other"].includes(delayCategory) ? delayCategory : "Other";
      $("#imDelayReasonSelect").disabled = isCompleted;
    }
    if ($("#imDelayInput")) {
      $("#imDelayInput").value = delayDetail;
      $("#imDelayInput").disabled = isCompleted;
      $("#imDelayInput").readOnly = isCompleted;
    }
    if ($("#imNotesInput")) {
      $("#imNotesInput").value = job.notes || "";
      $("#imNotesInput").disabled = isCompleted;
      $("#imNotesInput").readOnly = isCompleted;
    }
    updateInstallModalStepper(job.status);

    // 4. Activity Tab (only the selected project's installation history and status changes)
    const actTimeline = $("#imActivityTimeline");
    const jobActs = db.getJobActivity(job.id);
    if ($("#imActCount")) $("#imActCount").textContent = jobActs.length;

    if (actTimeline) {
      if (!jobActs.length) {
        actTimeline.innerHTML = `<div style="color:var(--muted); font-size:12px; padding:16px 0; text-align:center;">No activity logged yet for this installation.</div>`;
      } else {
        actTimeline.innerHTML = jobActs.map(item => `
          <div class="timeline-node">
            <div class="timeline-meta">
              <span class="record-tag">${calculateRelativeTime(item.timestamp || item.exactTime) || item.exactTime || item.time || "Recent"}</span>
              <span>•</span>
              <strong style="color:var(--ink);">${item.user || item.role}</strong>
            </div>
            <div class="timeline-title">${item.action}</div>
          </div>
        `).join("");
      }
    }

    // Read-only modal footer control for completed installations
    if ($("#btnSaveInstallModal")) {
      $("#btnSaveInstallModal").style.display = isCompleted ? "none" : "";
    }

    $("#installModal")?.classList.add("open");
  }

  function saveInstallModal() {
    const jobId = $("#imJobId")?.value;
    const newStatus = $("#imStatusSelect")?.value;
    let newSchedule = $("#imScheduleInput")?.value;
    const rescheduleDate = $("#imRescheduleDate")?.value;
    const rescheduleTime = $("#imRescheduleTime")?.value || "09:00 AM";
    const leadTech = $("#imLeadTechSelect")?.value;
    const notes = $("#imNotesInput")?.value;
    let delayReason = null;

    if (!jobId || !newStatus) return;

    // Require and validate delay reason for Delayed status
    if (newStatus === "Delayed") {
      const category = $("#imDelayReasonSelect")?.value;
      const detail = $("#imDelayInput")?.value?.trim();
      if (!category) {
        showToast("Delay reason is required for Delayed status (Permit Approval, Weather, Equipment Availability, Customer Reschedule, or Other).", "danger", "⚠");
        switchInstallModalTab("progress");
        $("#imDelayReasonSelect")?.focus();
        return;
      }
      delayReason = category + (detail ? ` — ${detail}` : "");
    }

    if (rescheduleDate) {
      try {
        const parts = rescheduleDate.split("-");
        if (parts.length === 3) {
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const m = months[parseInt(parts[1], 10) - 1] || parts[1];
          newSchedule = `${m} ${parseInt(parts[2], 10)}, ${parts[0]} at ${rescheduleTime}`;
        }
      } catch (e) {
        newSchedule = `${rescheduleDate} at ${rescheduleTime}`;
      }
    }

    const statusRes = db.updateInstallationStatus(jobId, newStatus, newSchedule, notes, delayReason, leadTech);
    if (statusRes && statusRes.success === false) {
      showToast(statusRes.error || "This installation cannot be updated yet.", "danger", "⚠");
      return;
    }
    // A new date notifies both the customer and the installer
    if (rescheduleDate) db.notifyInstallationRescheduled(db.data.installations.find(j => j.id === jobId), newSchedule);
    $("#installModal")?.classList.remove("open");
    showToast(`Installation ${jobId} updated to "${installStatusLabel(newStatus)}"${rescheduleDate ? " · customer and installer notified of the new schedule" : ""}`, "success", "⚡");
    renderCurrentPage();
  }

  // --- MAINTENANCE PAGE (Operations) ---
  const MAINT_STATUS_CLASS = { Assigned: "neutral", Scheduled: "direct", "In Progress": "warn", Completed: "success" };

  // Jobs shown on the Maintenance page (the engineer sees only the ones handled by or requested from them)
  function maintenanceJobs() {
    return db.data.installations.filter(j => {
      const m = db.getMaintenance(j);
      if (!m) return false;
      if (!IS_ENGINEER) return true;
      return (m.assignee && m.assignee.name === ENGINEER.name) || (m.request && m.request.name === ENGINEER.name);
    });
  }

  function maintScheduleText(m) {
    if (!m || !m.date) return "Not scheduled";
    return /^\d{4}-\d{2}-\d{2}$/.test(m.date) ? `${svDate(m.date)}${m.time ? ` · ${m.time}` : ""}` : m.date;
  }

  function renderMaintenance() {
    renderEngineerMaintenanceRequests();
    const body = $("#maintTableBody");
    if (!body) return;
    const q = ($("#maintSearch")?.value || "").trim().toLowerCase();
    const filter = state.maintFilter || "All";
    $$("#maintFilterTabs .chip-btn").forEach(b => b.classList.toggle("active", b.dataset.status === filter));
    const order = { "In Progress": 0, Scheduled: 1, Assigned: 2, Completed: 3 };
    const rows = maintenanceJobs().map(j => ({ job: j, m: db.getMaintenance(j) }))
      .filter(({ job, m }) => (filter === "All" || m.status === filter) &&
        (!q || [job.id, job.appId, job.customer, job.location, m.assignee && m.assignee.name, m.request && m.request.name]
          .some(x => String(x || "").toLowerCase().includes(q))))
      .sort((a, b) => (order[a.m.status] ?? 9) - (order[b.m.status] ?? 9));
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:22px;">${IS_ENGINEER ? "No maintenance assigned to you." : "No maintenance matching the filters."}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(({ job, m }) => `
      <tr>
        <td><strong>${safeText(job.id)}</strong><span class="sub-info">${safeText(job.customer || "—")}${job.appId ? ` · ${safeText(job.appId)}` : ""}</span></td>
        <td><span style="font-size:12.5px;">${safeText(job.location || "—")}</span><span class="sub-info">${safeText(job.system || "")}</span></td>
        <td>${m.assignee ? `${safeText(m.assignee.name)}<span class="sub-info">${safeText(m.assignee.company || "")}</span>` : `<span style="color:var(--muted);">Unassigned</span>`}
          ${m.request ? `<span class="sub-info" style="color:#b45309;">Waiting for ${safeText(m.request.name)} to accept</span>` : ""}</td>
        <td>${safeText(maintScheduleText(m))}</td>
        <td><span class="status-pill ${MAINT_STATUS_CLASS[m.status] || "neutral"}">${safeText(m.status)}</span></td>
        <td style="text-align:right; white-space:nowrap;"><button class="btn btn-secondary btn-sm" data-manage-maint="${safeText(job.id)}">Manage</button></td>
      </tr>`).join("");
  }

  function openMaintenanceModal(jobId) {
    if (!jobId) return;
    fillMaintenanceModal(jobId);
    $("#maintModal").classList.add("open");
  }

  // Saved maintenance dates can be ISO (2026-10-25) or older text (Sep 28, 2026): both fill the date box
  function maintIsoDate(d) {
    if (!d) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }

  function switchMaintTab(key) {
    $$("#mmTabs .modal-tab").forEach(t => t.classList.toggle("active", t.dataset.mmtab === key));
    $("#mmTabDetails")?.classList.toggle("active", key === "details");
    $("#mmTabHistory")?.classList.toggle("active", key === "history");
  }

  function setMaintStep(status) {
    if ($("#mmMaintStatusSelect")) $("#mmMaintStatusSelect").value = status;
    const order = ["Assigned", "Scheduled", "In Progress", "Completed"];
    const idx = order.indexOf(status);
    $$("#mmMaintStepper .step-item").forEach((item, i) => {
      item.classList.remove("active", "completed");
      if (i < idx || (status === "Completed" && i === idx)) item.classList.add("completed");
      else if (i === idx) item.classList.add("active");
      const bubble = item.querySelector(".step-bubble");
      if (bubble) bubble.textContent = item.classList.contains("completed") ? "✓" : String(i + 1);
    });
  }

  // History line "ADMIN (Limuel): schedule set to 2026-10-25 at 09:00 AM, assigned to …" → who + plain sentences
  function maintHistoryItem(h) {
    const text = String(h.text || "");
    const cut = text.indexOf(": ");
    const who = cut > 0 ? text.slice(0, cut) : "";
    const body = cut > 0 ? text.slice(cut + 2) : text;
    const parts = body.split(", ").map(t => t.replace(/\d{4}-\d{2}-\d{2}/g, d => svDate(d)))
      .map(t => t.charAt(0).toUpperCase() + t.slice(1));
    return `
      <div class="mm-history-item">
        <div class="mm-history-meta">${who ? `<strong>${safeText(who)}</strong> · ` : ""}${safeText(formatExactTimestamp(h.at))}</div>
        ${parts.map(t => `<div class="mm-history-text">${safeText(t)}</div>`).join("")}
      </div>`;
  }

  function fillMaintenanceModal(jobId) {
    const job = db.data.installations.find(j => j.id === jobId);
    if (!job) return;
    switchMaintTab("details");
    $("#mmJobId").value = job.id;
    $("#mmJobLabel").textContent = job.appId ? `${job.id} · ${job.appId}` : job.id;
    $("#mmCustomer").textContent = job.customer || "—";
    $("#mmLocation").textContent = job.location || "—";
    const m = db.getMaintenance(job);
    $("#mmSumPerson").textContent = m && m.assignee ? m.assignee.name : "Not assigned yet";
    $("#mmSumSchedule").textContent = maintScheduleText(m);
    const pill = $("#mmStatusPill");
    if (pill) {
      pill.textContent = m ? m.status : "New";
      pill.className = `status-pill ${m ? (MAINT_STATUS_CLASS[m.status] || "neutral") : "neutral"}`;
    }
    const people = db.getMaintenancePeople();
    const sel = $("#mmMaintPersonSelect");
    if (sel) {
      sel.innerHTML = `<option value="">Choose a person…</option>` + people.map(p =>
        `<option value="${safeText(p.key)}"${m && m.assignee && m.assignee.name === p.name ? " selected" : ""}>${safeText(p.name)} (${safeText(p.company)})</option>`).join("");
      sel.dataset.current = m && m.assignee ? sel.value : "";
    }
    if ($("#mmPersonHint")) $("#mmPersonHint").style.display = "none";
    const isoDate = maintIsoDate(m && m.date);
    if ($("#mmMaintDate")) $("#mmMaintDate").value = isoDate;
    if ($("#mmMaintTime")) $("#mmMaintTime").value = (m && m.time) || "09:00 AM";
    // Remember what was filled in so an untouched schedule is not saved as a change
    const modal = $("#maintModal");
    if (modal) {
      modal.dataset.prefillDate = isoDate;
      modal.dataset.prefillTime = $("#mmMaintTime")?.value || "";
    }
    if ($("#mmMaintNotes")) $("#mmMaintNotes").value = (m && m.notes) || "";
    setMaintStep((m && m.status) || "Assigned");
    const banner = $("#mmMaintRequestBanner");
    if (banner) {
      banner.style.display = m && m.request ? "block" : "none";
      banner.innerHTML = m && m.request
        ? `<strong>Waiting for ${safeText(m.request.name)}</strong> to accept or decline. Until then, ${safeText(m.assignee ? m.assignee.name : "the current person")} stays assigned.`
        : "";
    }
    const hist = $("#mmMaintHistory");
    const items = (m && m.history) || [];
    if ($("#mmHistCount")) $("#mmHistCount").textContent = items.length;
    if (hist) {
      hist.innerHTML = !items.length
        ? `<div class="mm-history-empty">${m ? "No changes recorded yet." : "No maintenance yet. Choose a person and a date to schedule one."}</div>`
        : items.map(maintHistoryItem).join("");
    }
  }

  function saveMaintenanceModal() {
    const jobId = $("#mmJobId")?.value;
    if (!jobId) return;
    const job = db.data.installations.find(j => j.id === jobId);
    const m = db.getMaintenance(job);
    const modal = $("#maintModal");
    let date = $("#mmMaintDate")?.value || "";
    let time = $("#mmMaintTime")?.value || "";
    // Schedule left as it was: keep the saved values (older text dates and empty times stay unchanged)
    if (m && modal && date === modal.dataset.prefillDate && time === modal.dataset.prefillTime) {
      date = m.date || "";
      time = m.time || "";
    }
    const res = db.saveMaintenance(jobId, {
      personKey: $("#mmMaintPersonSelect")?.value || "",
      date,
      time,
      status: $("#mmMaintStatusSelect")?.value || "",
      notes: $("#mmMaintNotes")?.value ?? ""
    });
    if (!res.success) { showToast(res.message, "warn", "⚠"); return; }
    showToast(res.requestSent ? "Request sent. Both people were notified; waiting for the new person to accept or decline." : `Maintenance saved for ${jobId}.`, "success", "🔧");
    renderCurrentPage();
    fillMaintenanceModal(jobId);
  }

  // Engineer view: maintenance requests waiting for this engineer's answer
  function renderEngineerMaintenanceRequests() {
    let box = $("#engineerMaintRequests");
    if (!IS_ENGINEER) { if (box) box.remove(); return; }
    const waiting = db.data.installations.filter(j => j.maintenance && j.maintenance.request && j.maintenance.request.name === ENGINEER.name);
    if (!box) {
      box = document.createElement("div");
      box.id = "engineerMaintRequests";
      $("#page-maintenance .toolbar-wrap")?.insertAdjacentElement("beforebegin", box);
    }
    box.innerHTML = waiting.map(j => `
      <div class="sa-callout" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <div><strong>Maintenance request · ${safeText(j.id)}</strong> (${safeText(j.customer)}): moved to you from ${safeText(j.maintenance.assignee ? j.maintenance.assignee.name : "—")}.</div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary btn-sm" data-maint-respond="accept" data-job="${safeText(j.id)}">Accept</button>
          <button class="btn btn-secondary btn-sm" data-maint-respond="decline" data-job="${safeText(j.id)}">Decline</button>
        </div>
      </div>`).join("");
  }

  // --- SCHEDULING WORKFLOW (+ Schedule Ready Project) ---
  let currentSchedulableCandidates = [];

  function updateNewInstallModalPreview(cand) {
    if (!cand) {
      if ($("#schedAppId")) $("#schedAppId").textContent = "—";
      if ($("#schedCustomer")) $("#schedCustomer").textContent = "—";
      if ($("#schedLocation")) $("#schedLocation").textContent = "—";
      if ($("#schedSystem")) $("#schedSystem").textContent = "—";
      if ($("#schedType")) $("#schedType").textContent = "—";
      if ($("#schedInstaller")) $("#schedInstaller").textContent = "—";
      if ($("#schedLead")) $("#schedLead").textContent = "Lead: Unassigned";
      return;
    }

    const isDirect = cand.installerType === "Hello Solar Direct";
    const isMaintenance = cand.installerType === "Maintenance";
    const isLeadAssigned = cand.leadTech &&
      cand.leadTech !== "Hello Solar Internal Team" &&
      cand.leadTech !== "Unassigned";

    if ($("#schedAppId")) $("#schedAppId").textContent = `${cand.id || cand.appId}`;
    if ($("#schedCustomer")) $("#schedCustomer").textContent = cand.customer;
    if ($("#schedLocation")) $("#schedLocation").textContent = cand.location;
    if ($("#schedSystem")) $("#schedSystem").textContent = cand.system;
    if ($("#schedType")) {
      $("#schedType").textContent = isDirect ? "🏠 Hello Solar Installation" : (isMaintenance ? "🔧 Maintenance" : cand.installerType);
    }
    if ($("#schedInstaller")) $("#schedInstaller").textContent = isDirect ? "Hello Solar Internal Team" : cand.installer;
    if ($("#schedLead")) $("#schedLead").textContent = isLeadAssigned ? cand.leadTech : "Lead: Unassigned";
  }

  function openNewInstallModal() {
    currentSchedulableCandidates = db.getSchedulableProjects();
    const selectEl = $("#newInstallAppSelect");
    const emptyMsg = $("#newInstallEmptyMsg");
    const gridEl = $("#newInstallDetailsGrid");
    const saveBtn = $("#btnSaveNewInstall");

    if (!currentSchedulableCandidates.length) {
      if (selectEl) {
        selectEl.innerHTML = `<option disabled selected>No ready projects awaiting schedule</option>`;
        selectEl.disabled = true;
      }
      if (emptyMsg) emptyMsg.style.display = "block";
      if (gridEl) gridEl.style.display = "none";
      if (saveBtn) saveBtn.disabled = true;
      updateNewInstallModalPreview(null);
    } else {
      if (selectEl) {
        selectEl.disabled = false;
        selectEl.innerHTML = currentSchedulableCandidates.map(c => `
          <option value="${c.id || c.appId}">${c.id} • ${c.customer} (${c.location} - ${c.system}) [${c.installerType}]</option>
        `).join("");
      }
      if (emptyMsg) emptyMsg.style.display = "none";
      if (gridEl) gridEl.style.display = "grid";
      if (saveBtn) saveBtn.disabled = false;

      // Set default target date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      if ($("#newInstallDateInput")) $("#newInstallDateInput").value = tomorrowStr;
      if ($("#newInstallTimeSelect")) $("#newInstallTimeSelect").value = "09:00 AM";
      if ($("#newInstallLeadSelect")) $("#newInstallLeadSelect").value = "Engr. Limuel Brasona";

      updateNewInstallModalPreview(currentSchedulableCandidates[0]);
    }

    $("#newInstallModal")?.classList.add("open");
  }

  function saveNewInstall() {
    const selectedKey = $("#newInstallAppSelect")?.value;
    const date = $("#newInstallDateInput")?.value;
    const time = $("#newInstallTimeSelect")?.value || "09:00 AM";
    const teamLead = $("#newInstallLeadSelect")?.value || "Unassigned";

    if (!selectedKey) {
      showToast("Please select a ready project to schedule.", "danger", "⚠");
      return;
    }
    if (!date) {
      showToast("Please select an installation date.", "warn", "📅");
      return;
    }

    const cand = currentSchedulableCandidates.find(c => (c.appId === selectedKey || c.id === selectedKey));
    const targetId = cand ? (cand.id || cand.appId) : selectedKey;

    const res = db.scheduleReadyProject(targetId, date, time, teamLead);
    if (res.success) {
      $("#newInstallModal")?.classList.remove("open");
      showToast(`Installation scheduled successfully for ${res.job ? res.job.id : targetId} on ${res.job ? res.job.schedule : date}! Lead: ${res.job ? res.job.leadTech : teamLead}`, "success", "✓");
      renderCurrentPage();
    } else {
      showToast(res.message || "Failed to schedule installation.", "danger", "⚠");
    }
  }

  // ==================== 4. ACCOUNTS PAGE ====================
  function syncAccountTabs() {
    $$("#accountSubtabs .subtab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.tab === state.accountCurrentTab);
    });
  }

  // --- Financer contract display helpers ---
  function formatContractRate(rate) {
    return rate === null || rate === undefined || rate === "" ? "—" : `${Number(rate).toFixed(2).replace(/\.?0+$/, "")}% p.a.`;
  }

  function formatContractTerm(months) {
    if (!months) return "—";
    const yrs = months % 12 === 0 ? ` (${months / 12} yr${months / 12 > 1 ? "s" : ""})` : "";
    return `${months} months${yrs}`;
  }

  function contractOwnerPill(contract) {
    return contract.ownerType === "Financer"
      ? `<span class="status-pill success">${safeText(contract.ownerName)}</span>`
      : `<span class="status-pill direct">Hello Solar</span>`;
  }

  function renderAccounts() {
    if (typeof db.syncFinancerContracts === "function") db.syncFinancerContracts();
    const custs = db.data.customers;
    const fins = db.data.financers;
    const insts = db.data.installers;
    const merchs = db.data.merchants;

    if ($("#accountCountCust")) $("#accountCountCust").textContent = custs.length;
    if ($("#accountCountFin")) $("#accountCountFin").textContent = fins.length;
    if ($("#accountCountInst")) $("#accountCountInst").textContent = insts.length;
    if ($("#accountCountMerch")) $("#accountCountMerch").textContent = merchs.length;
    const engs = db.data.engineers || [];
    if ($("#accountCountEng")) $("#accountCountEng").textContent = engs.length;
    const accts = db.data.accountants || [];
    if ($("#accountCountAcc")) $("#accountCountAcc").textContent = accts.length;

    const thead = $("#accountsTableHead");
    const tbody = $("#accountsTableBody");
    if (!thead || !tbody) return;

    const q = state.accountSearchQuery.toLowerCase().trim();
    const stat = state.accountStatusFilter;

    if (state.accountCurrentTab === "accountants") {
      thead.innerHTML = `
        <tr>
          <th>Accounting ID</th>
          <th>Full Name</th>
          <th>Role</th>
          <th>Contact</th>
          <th>Status</th>
          <th style="text-align: right;">Action</th>
        </tr>
      `;
      const filtered = accts.filter(a => {
        const matchStatus = stat === "All" || a.status === stat;
        const matchSearch = !q || [a.id, a.name, a.email, a.phone].some(v => (v || "").toLowerCase().includes(q));
        return matchStatus && matchSearch;
      });
      tbody.innerHTML = !filtered.length
        ? `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--muted);">No Accounting accounts found.</td></tr>`
        : filtered.map(a => `
          <tr>
            <td><span class="record-id">${safeText(a.id)}</span></td>
            <td><strong>${safeText(a.name)}</strong><span class="sub-info">Joined ${safeText(a.joined || '—')}</span></td>
            <td><span class="status-pill neutral">Accounting</span></td>
            <td><span style="font-size:12px;">${safeText(a.email)}</span><span class="sub-info">${safeText(a.phone)}</span></td>
            <td><span class="status-pill ${getStatusClass(a.status)}">${safeText(a.status)}</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm" data-view-account="accountants:${safeText(a.id)}">View Profile</button>
            </td>
          </tr>
        `).join("");
    } else if (state.accountCurrentTab === "engineers") {
      thead.innerHTML = `
        <tr>
          <th>Engineer ID</th>
          <th>Full Name</th>
          <th>Role</th>
          <th>Contact</th>
          <th>Status</th>
          <th style="text-align: right;">Action</th>
        </tr>
      `;
      const filtered = engs.filter(e => {
        const matchStatus = stat === "All" || e.status === stat;
        const matchSearch = !q || [e.id, e.name, e.email, e.phone].some(v => (v || "").toLowerCase().includes(q));
        return matchStatus && matchSearch;
      });
      tbody.innerHTML = !filtered.length
        ? `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--muted);">No Installation Engineer accounts found.</td></tr>`
        : filtered.map(e => `
          <tr>
            <td><span class="record-id">${safeText(e.id)}</span></td>
            <td><strong>${safeText(e.name)}</strong><span class="sub-info">Joined ${safeText(e.joined || '—')}</span></td>
            <td><span class="status-pill direct">Installation Engineer</span></td>
            <td><span style="font-size:12px;">${safeText(e.email)}</span><span class="sub-info">${safeText(e.phone)}</span></td>
            <td><span class="status-pill ${getStatusClass(e.status)}">${safeText(e.status)}</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm" data-view-account="engineers:${safeText(e.id)}">View Profile</button>
            </td>
          </tr>
        `).join("");
    } else if (state.accountCurrentTab === "customers") {
      thead.innerHTML = `
        <tr>
          <th>Customer ID</th>
          <th>Name</th>
          <th>Location</th>
          <th>Linked System / App</th>
          <th>Contact</th>
          <th>Status</th>
          <th style="text-align: right;">Action</th>
        </tr>
      `;

      const filtered = custs.filter(c => {
        const matchStatus = stat === "All" || c.status === stat;
        const matchSearch = !q || (
          c.id.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q)) ||
          c.location.toLowerCase().includes(q) ||
          (c.appId && c.appId.toLowerCase().includes(q)) ||
          (c.system && c.system.toLowerCase().includes(q))
        );
        return matchStatus && matchSearch;
      });

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--muted);">No customer accounts found.</td></tr>`;
      } else {
        tbody.innerHTML = filtered.map(c => `
          <tr>
            <td><span class="record-id">${c.id}</span></td>
            <td><strong>${c.name}</strong><span class="sub-info">Joined ${c.joined || '2026'}</span></td>
            <td>${c.location}</td>
            <td><span style="font-weight:700;">${c.system}</span><span class="sub-info">${c.appId || 'Direct'}</span></td>
            <td><span style="font-size:12px;">${c.email}</span><span class="sub-info">${c.phone}</span></td>
            <td>
              <span class="status-pill ${getStatusClass(c.status)}">${c.status}</span>
              ${c.invitationStatus ? `<span class="sub-info" style="margin-top:2px;">Invite: ${c.invitationStatus === 'Active' ? 'Active' : 'Pending Activation'}</span>` : ''}
            </td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm" data-view-account="customers:${c.id}">View Profile</button>
            </td>
          </tr>
        `).join("");
      }

    } else if (state.accountCurrentTab === "financers") {
      thead.innerHTML = `
        <tr>
          <th>Financer ID</th>
          <th>Institution Name</th>
          <th>Active Loans</th>
          <th>Total Funded Volume</th>
          <th style="min-width:200px;">Contract</th>
          <th>Revenue Owner</th>
          <th>Status</th>
          <th style="text-align: right;">Action</th>
        </tr>
      `;

      const filtered = fins.filter(f => {
        const matchStatus = stat === "All" || f.status === stat;
        const contract = db.getFinancerContract(f);
        const matchSearch = !q || (
          contract.status.toLowerCase().includes(q) ||
          contract.ownerName.toLowerCase().includes(q) ||
          f.id.toLowerCase().includes(q) ||
          f.name.toLowerCase().includes(q) ||
          f.contact.toLowerCase().includes(q) ||
          f.email.toLowerCase().includes(q) ||
          f.phone.toLowerCase().includes(q)
        );
        return matchStatus && matchSearch;
      });

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--muted);">No financer accounts found.</td></tr>`;
      } else {
        tbody.innerHTML = filtered.map(f => {
          const contract = db.getFinancerContract(f);
          return `
          <tr>
            <td><span class="record-id">${f.id}</span></td>
            <td><strong>${f.name}</strong><span class="sub-info">${f.email}</span></td>
            <td><strong>${f.activeLoans}</strong> loans</td>
            <td><strong style="color:var(--ink);">${peso(f.totalFunded)}</strong></td>
            <td>
              <span class="status-pill ${getStatusClass(contract.status)}">${contract.status}</span>
              <span class="sub-info" style="white-space:nowrap;">${contract.termMonths ? `${contract.termMonths} months · ${formatContractRate(contract.annualRate)}` : "Not configured"}</span>
            </td>
            <td>${contractOwnerPill(contract)}</td>
            <td><span class="status-pill ${getStatusClass(f.status)}">${f.status}</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm" data-view-account="financers:${f.id}">View Profile</button>
            </td>
          </tr>
        `;
        }).join("");
      }

    } else if (state.accountCurrentTab === "installers") {
      thead.innerHTML = `
        <tr>
          <th>Installer ID</th>
          <th>Company / Team</th>
          <th>Installer Model</th>
          <th>Active Jobs</th>
          <th>Completed Jobs</th>
          <th>Status</th>
          <th style="text-align: right;">Action</th>
        </tr>
      `;

      const filtered = insts.filter(i => {
        const matchStatus = stat === "All" || i.status === stat;
        const matchSearch = !q || (
          i.id.toLowerCase().includes(q) ||
          i.name.toLowerCase().includes(q) ||
          i.contact.toLowerCase().includes(q) ||
          i.email.toLowerCase().includes(q) ||
          i.phone.toLowerCase().includes(q)
        );
        return matchStatus && matchSearch;
      });

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--muted);">No installer accounts found.</td></tr>`;
      } else {
        tbody.innerHTML = filtered.map(i => {
          const isDirect = i.id === "INS-001" || i.type === "Internal";
          const companyName = isDirect ? "Hello Solar Internal Team" : i.name;
          const modelDisplay = isDirect ? "🏠 Hello Solar Installation" : "Partner Installer";
          const modelPill = isDirect ? "direct" : "neutral";

          return `
            <tr>
              <td><span class="record-id">${i.id}</span></td>
              <td><strong>${companyName}</strong><span class="sub-info">Lead: ${i.contact}</span></td>
              <td>
                <span class="status-pill ${modelPill}">
                  ${modelDisplay}
                </span>
              </td>
              <td><strong>${i.activeJobs}</strong> active</td>
              <td>${i.completedJobs} completed</td>
              <td><span class="status-pill ${getStatusClass(i.status)}">${i.status}</span></td>
              <td style="text-align: right;">
                <button class="btn btn-secondary btn-sm" data-view-account="installers:${i.id}">View Profile</button>
              </td>
            </tr>
          `;
        }).join("");
      }

    } else if (state.accountCurrentTab === "merchants") {
      thead.innerHTML = `
        <tr>
          <th>Merchant ID</th>
          <th>Business Name</th>
          <th>Active Projects</th>
          <th>Processed Volume</th>
          <th>Contact</th>
          <th>Status</th>
          <th style="text-align: right;">Action</th>
        </tr>
      `;

      const filtered = merchs.filter(m => {
        const matchStatus = stat === "All" || m.status === stat;
        const matchSearch = !q || (
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.contact.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          m.phone.toLowerCase().includes(q)
        );
        return matchStatus && matchSearch;
      });

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--muted);">No merchant accounts found.</td></tr>`;
      } else {
        tbody.innerHTML = filtered.map(m => `
          <tr>
            <td><span class="record-id">${m.id}</span></td>
            <td><strong>${m.name}</strong><span class="sub-info">${m.email}</span></td>
            <td><strong>${m.projects}</strong> projects</td>
            <td><strong>${peso(m.volume)}</strong> (${m.transactions} txns)</td>
            <td>${m.contact}<span class="sub-info">${m.phone}</span></td>
            <td><span class="status-pill ${getStatusClass(m.status)}">${m.status}</span></td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm" data-view-account="merchants:${m.id}">View Profile</button>
            </td>
          </tr>
        `).join("");
      }
    }
  }

  // --- ACCOUNT PROFILE WORKSPACE MODAL (Overview | Related Records | Activity) ---
  function switchAccountModalTab(tabKey) {
    $$("#accountModalTabs .modal-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.acmtab === tabKey);
    });
    $$("#accountModal .modal-tab-content").forEach(content => {
      content.classList.toggle("active", content.id === `acmTabContent${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
    });
  }

  function renderFinancerContractSection(fin) {
    const c = db.getFinancerContract(fin);
    const remaining = c.status === "Active" && c.daysRemaining !== null ? `<span class="sub-info">${c.daysRemaining} day${c.daysRemaining === 1 ? "" : "s"} remaining</span>` : "";
    const ownerNote = c.ownerType === "Financer"
      ? "Contract is active — the financer owns funding and revenue for its financed applications."
      : (c.status === "No Contract"
        ? "No contract configured — Hello Solar owns funding and revenue."
        : `Contract ${c.status.toLowerCase()} — funding and revenue ownership is with Hello Solar.`);
    return `
      <div class="detail-item" style="grid-column:1 / -1; border-top:1px solid var(--line); padding-top:12px; margin-top:4px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
          <div>
            <div style="font-weight:700; font-size:12.5px; color:var(--ink);">Financer Contract</div>
            <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${ownerNote}</div>
          </div>
          <button class="btn btn-secondary btn-sm" data-edit-financer-contract="${safeText(fin.id)}">${c.status === "No Contract" ? "Set Up Contract" : "Edit Contract"}</button>
        </div>
      </div>
      <div class="detail-item"><span>Contract Term</span><strong>${formatContractTerm(c.termMonths)}</strong></div>
      <div class="detail-item"><span>Annual Rate</span><strong>${formatContractRate(c.annualRate)}</strong></div>
      <div class="detail-item"><span>Contract Start Date</span><strong>${c.startDate ? formatReadableDate(c.startDate) : "—"}</strong></div>
      <div class="detail-item"><span>Contract End Date</span><strong>${c.endDate ? formatReadableDate(c.endDate) : "—"}</strong></div>
      <div class="detail-item"><span>Contract Status</span><div><span class="status-pill ${getStatusClass(c.status)}">${c.status}</span>${remaining}</div></div>
      <div class="detail-item"><span>Current Funding / Revenue Owner</span><div>${contractOwnerPill(c)}</div></div>
    `;
  }

  function updateFinancerContractPreview() {
    const term = Number($("#fcTermInput")?.value);
    const start = $("#fcStartInput")?.value;
    const end = $("#fcEndInput")?.value;
    const preview = $("#fcOwnerPreview");
    const finId = $("#fcFinancerId")?.value;
    const fin = (db.data.financers || []).find(f => f.id === finId);
    if (!preview || !fin) return;
    const draft = { ...fin, contractStartDate: start || null, contractEndDate: end || null, contractTermMonths: term || null, contractStatusOverride: $("#fcStatusOverride")?.value === "Terminated" ? "Terminated" : null };
    const c = db.getFinancerContract(draft);
    preview.innerHTML = `Resulting status: <span class="status-pill ${getStatusClass(c.status)}">${c.status}</span> &nbsp;·&nbsp; Funding / Revenue Owner: ${contractOwnerPill(c)}`;
  }

  function openFinancerContractModal(finId) {
    const fin = (db.data.financers || []).find(f => f.id === finId);
    if (!fin) return;
    $("#fcFinancerId").value = fin.id;
    $("#fcFinancerName").textContent = `${fin.name} (${fin.id})`;
    $("#fcTermInput").value = fin.contractTermMonths ?? "";
    $("#fcRateInput").value = fin.annualRate ?? "";
    $("#fcStartInput").value = fin.contractStartDate || "";
    $("#fcEndInput").value = fin.contractEndDate || "";
    $("#fcStatusOverride").value = fin.contractStatusOverride === "Terminated" ? "Terminated" : "";
    $("#fcError").style.display = "none";
    updateFinancerContractPreview();
    $("#financerContractModal")?.classList.add("open");
  }

  function autoFillFinancerContractEnd() {
    const term = Number($("#fcTermInput")?.value);
    const start = $("#fcStartInput")?.value;
    if (start && Number.isInteger(term) && term > 0) {
      $("#fcEndInput").value = window.HelloSolarStore.addMonthsISO(start, term) || "";
    }
    updateFinancerContractPreview();
  }

  function saveFinancerContract() {
    const finId = $("#fcFinancerId").value;
    const res = db.updateFinancerContract(finId, {
      contractTermMonths: $("#fcTermInput").value,
      annualRate: $("#fcRateInput").value,
      contractStartDate: $("#fcStartInput").value,
      contractEndDate: $("#fcEndInput").value,
      contractStatusOverride: $("#fcStatusOverride").value || null
    });
    if (!res.success) {
      const err = $("#fcError");
      err.textContent = res.error;
      err.style.display = "block";
      return;
    }
    $("#financerContractModal")?.classList.remove("open");
    showToast(`Contract saved for ${safeText(res.financer.name)} · ${res.contract.status} · Owner: ${safeText(res.contract.ownerName)}`, "success", "✓");
    renderCurrentPage();
    openAccountModal("financers", finId);
  }

  function openAccountModal(typeKey, id) {
    let list = [];
    if (typeKey === "customers") list = db.data.customers;
    else if (typeKey === "financers") list = db.data.financers;
    else if (typeKey === "installers") list = db.data.installers;
    else if (typeKey === "merchants") list = db.data.merchants;
    else if (typeKey === "engineers") list = db.data.engineers || [];
    else if (typeKey === "accountants") list = db.data.accountants || [];

    const acc = list.find(a => a.id === id);
    if (!acc) return;

    state.selectedAccountId = { typeKey, id };
    switchAccountModalTab("overview");

    const typeLabels = {
      customers: "CUSTOMER PROFILE",
      financers: "FINANCER PROFILE",
      installers: "INSTALLER PROFILE",
      merchants: "MERCHANT PROFILE",
      engineers: "DIRECT INSTALLATION ENGINEER PROFILE",
      accountants: "ACCOUNTING PROFILE"
    };

    if ($("#acmId")) $("#acmId").value = id;
    if ($("#acmRawType")) $("#acmRawType").value = typeKey;
    if ($("#acmType")) $("#acmType").textContent = typeLabels[typeKey] || "ACCOUNT PROFILE";

    const isInternalInst = typeKey === "installers" && (acc.id === "INS-001" || acc.type === "Internal");
    const displayName = isInternalInst ? "Hello Solar Internal Team" : acc.name;
    if ($("#acmName")) $("#acmName").textContent = displayName;

    const badge = $("#acmStatusBadge");
    if (badge) {
      badge.textContent = acc.status;
      badge.className = `status-pill ${getStatusClass(acc.status)}`;
    }

    // Status alert banner
    const alertEl = $("#acmStatusAlert");
    if (alertEl) {
      if (acc.status === "Suspended") {
        alertEl.style.display = "block";
        alertEl.style.background = "#fff2f0";
        alertEl.style.border = "1px solid #ffccc7";
        alertEl.style.color = "#cf1322";
        alertEl.innerHTML = `<strong>⚠ Account Suspended:</strong> Operational privileges and portal access are frozen pending compliance review. Historical data, applications, installations, and transactions are preserved.`;
      } else if (acc.status === "Pending Review") {
        alertEl.style.display = "block";
        alertEl.style.background = "#fffbe6";
        alertEl.style.border = "1px solid #ffe58f";
        alertEl.style.color = "#d46b08";
        alertEl.innerHTML = `<strong>ℹ Pending Review:</strong> New stakeholder account awaiting initial verification and Super Admin approval before portal access activation.`;
      } else if (acc.status === "Inactive") {
        alertEl.style.display = "block";
        alertEl.style.background = "#f5f5f5";
        alertEl.style.border = "1px solid #d9d9d9";
        alertEl.style.color = "#595959";
        alertEl.innerHTML = `<strong>Account Inactive:</strong> Stakeholder portal access is currently paused. Use administrative controls to reactivate when ready.`;
      } else {
        alertEl.style.display = "none";
      }
    }

    // 1. Overview Tab Grid
    const grid = $("#acmOverviewGrid");
    if (grid) {
      let fields = "";
      if (typeKey === "customers") {
        const linkedApp = db.data.applications.find(a => a.customerId === acc.id || a.id === acc.appId || (a.customer && a.customer.toLowerCase() === acc.name.toLowerCase()));
        fields = `
          <div class="detail-item"><span>Customer ID</span><strong>${acc.id}</strong></div>
          <div class="detail-item"><span>Full Name</span><strong>${acc.name}</strong></div>
          <div class="detail-item"><span>Primary Email</span><strong>${acc.email || '—'}</strong></div>
          <div class="detail-item"><span>Contact Phone</span><strong>${acc.phone || '—'}</strong></div>
          <div class="detail-item"><span>Service Location</span><strong>${acc.location || '—'}</strong></div>
          <div class="detail-item"><span>Account Status</span><div><span class="status-pill ${getStatusClass(acc.status)}">${acc.status}</span></div></div>
          <div class="detail-item"><span>Solar System</span><strong>${acc.system || '—'}</strong></div>
          ${acc.hsId ? `<div class="detail-item"><span>HS ID</span><strong>${safeText(acc.hsId)}</strong></div>
          <div class="detail-item"><span>System Status</span><strong>${safeText(acc.systemStatus)}</strong></div>
          <div class="detail-item"><span>Project Type</span><strong>${safeText(acc.projectType)}</strong></div>
          <div class="detail-item"><span>Linked Inquiry</span><strong>${safeText(acc.inquiryId || 'None — direct registration')}</strong></div>` : ''}
          <div class="detail-item"><span>Linked Application</span><strong style="color:var(--brand);">${acc.appId || (linkedApp ? linkedApp.id : 'Direct Record')}</strong></div>
          <div class="detail-item"><span>Financing Partner</span><strong>${linkedApp ? linkedApp.financer : 'Direct / Cash'}</strong></div>
          <div class="detail-item"><span>Monthly Repayment</span><strong>${linkedApp ? peso(linkedApp.monthly) + ' / mo' : '—'}</strong></div>
          <div class="detail-item"><span>Payment Health</span><div>${linkedApp ? `<span class="status-pill ${getStatusClass(linkedApp.paymentStatus)}">${linkedApp.paymentStatus}</span>` : '—'}</div></div>
          <div class="detail-item"><span>Member Since</span><strong>${acc.joined || '2026-03-12'}</strong></div>
        `;
      } else if (typeKey === "financers") {
        fields = `
          <div class="detail-item"><span>Financer ID</span><strong>${acc.id}</strong></div>
          <div class="detail-item"><span>Institution Name</span><strong>${acc.name}</strong></div>
          <div class="detail-item"><span>Primary Contact</span><strong>${acc.contact}</strong></div>
          <div class="detail-item"><span>Official Email</span><strong>${acc.email}</strong></div>
          <div class="detail-item"><span>Contact Phone</span><strong>${acc.phone}</strong></div>
          <div class="detail-item"><span>Account Status</span><div><span class="status-pill ${getStatusClass(acc.status)}">${acc.status}</span></div></div>
          <div class="detail-item"><span>Active Financed Loans</span><strong>${acc.activeLoans} accounts</strong></div>
          <div class="detail-item"><span>Total Funded Capital</span><strong style="color:var(--ink); font-size:15px;">${peso(acc.totalFunded)}</strong></div>
          <div class="detail-item"><span>Institution Type</span><strong>Regulated Energy Lending Partner</strong></div>
          <div class="detail-item"><span>Credit Integration</span><strong>Central Mesh Connected</strong></div>
          ${renderFinancerContractSection(acc)}
        `;
      } else if (typeKey === "installers") {
        const isDirect = acc.id === "INS-001" || acc.type === "Internal";
        fields = `
          <div class="detail-item"><span>Installer ID</span><strong>${acc.id}</strong></div>
          <div class="detail-item"><span>Company / Team</span><strong>${isDirect ? 'Hello Solar Internal Team' : acc.name}</strong></div>
          <div class="detail-item"><span>Team Lead / Contact</span><strong>${acc.contact}</strong></div>
          <div class="detail-item"><span>Contact Email</span><strong>${acc.email}</strong></div>
          <div class="detail-item"><span>Contact Phone</span><strong>${acc.phone}</strong></div>
          <div class="detail-item"><span>Installer Model</span><div><span class="status-pill ${isDirect ? 'direct' : 'neutral'}">${isDirect ? '🏠 Hello Solar Installation' : 'Partner Installer'}</span></div></div>
          <div class="detail-item"><span>Active Installations</span><strong>${acc.activeJobs} jobs active</strong></div>
          <div class="detail-item"><span>Completed Installations</span><strong>${acc.completedJobs} projects completed</strong></div>
          <div class="detail-item"><span>Quality Rating</span><strong>⭐ ${acc.rating || '4.8'} / 5.0</strong></div>
          <div class="detail-item"><span>Account Status</span><div><span class="status-pill ${getStatusClass(acc.status)}">${acc.status}</span></div></div>
        `;
      } else if (typeKey === "engineers") {
        const assigned = db.getDirectInstallJobs().filter(j => j.leadTech === acc.name);
        fields = `
          <div class="detail-item"><span>Engineer ID</span><strong>${safeText(acc.id)}</strong></div>
          <div class="detail-item"><span>Full Name</span><strong>${safeText(acc.name)}</strong></div>
          <div class="detail-item"><span>Email</span><strong>${safeText(acc.email || '—')}</strong></div>
          <div class="detail-item"><span>Mobile Number</span><strong>${safeText(acc.phone || '—')}</strong></div>
          <div class="detail-item"><span>Role</span><div><span class="status-pill direct">Installation Engineer</span></div></div>
          <div class="detail-item"><span>Account Status</span><div><span class="status-pill ${getStatusClass(acc.status)}">${safeText(acc.status)}</span></div></div>
          <div class="detail-item"><span>Portal Access</span><strong>Applications · Installations (Hello Solar Installation)</strong></div>
          <div class="detail-item"><span>Direct Jobs Led</span><strong>${assigned.length} (${assigned.filter(j => j.status !== "Completed").length} active)</strong></div>
          <div class="detail-item"><span>Member Since</span><strong>${safeText(acc.joined || '—')}</strong></div>
        `;
      } else if (typeKey === "accountants") {
        fields = `
          <div class="detail-item"><span>Accounting ID</span><strong>${safeText(acc.id)}</strong></div>
          <div class="detail-item"><span>Full Name</span><strong>${safeText(acc.name)}</strong></div>
          <div class="detail-item"><span>Email</span><strong>${safeText(acc.email || '—')}</strong></div>
          <div class="detail-item"><span>Mobile Number</span><strong>${safeText(acc.phone || '—')}</strong></div>
          <div class="detail-item"><span>Role</span><div><span class="status-pill neutral">Accounting</span></div></div>
          <div class="detail-item"><span>Account Status</span><div><span class="status-pill ${getStatusClass(acc.status)}">${safeText(acc.status)}</span></div></div>
          <div class="detail-item"><span>Portal Access</span><strong>Accounting only</strong></div>
          <div class="detail-item"><span>Member Since</span><strong>${safeText(acc.joined || '—')}</strong></div>
        `;
      } else if (typeKey === "merchants") {
        fields = `
          <div class="detail-item"><span>Merchant ID</span><strong>${acc.id}</strong></div>
          <div class="detail-item"><span>Business Name</span><strong>${acc.name}</strong></div>
          <div class="detail-item"><span>Primary Representative</span><strong>${acc.contact}</strong></div>
          <div class="detail-item"><span>Email Address</span><strong>${acc.email}</strong></div>
          <div class="detail-item"><span>Phone Number</span><strong>${acc.phone}</strong></div>
          <div class="detail-item"><span>Account Status</span><div><span class="status-pill ${getStatusClass(acc.status)}">${acc.status}</span></div></div>
          <div class="detail-item"><span>Active Solar Projects</span><strong>${acc.projects} projects</strong></div>
          <div class="detail-item"><span>Processed Orders</span><strong>${acc.transactions} equipment orders</strong></div>
          <div class="detail-item"><span>Processed Volume</span><strong style="color:var(--ink); font-size:15px;">${peso(acc.volume)}</strong></div>
          <div class="detail-item"><span>Merchant Category</span><strong>Solar Hardware & Material Supply</strong></div>
        `;
      }
      grid.innerHTML = fields;
    }

    // Administrative Action Buttons inside profile view
    const adminActionsContainer = $("#acmAdminActions");
    if (adminActionsContainer) {
      let actionButtons = "";
      if (acc.status === "Active") {
        actionButtons = `
          <button class="btn btn-secondary btn-sm" data-admin-action="Deactivate">Deactivate</button>
          <button class="btn btn-sm" data-admin-action="Suspend" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;">Suspend</button>
        `;
      } else if (acc.status === "Inactive") {
        actionButtons = `
          <button class="btn btn-primary btn-sm" data-admin-action="Activate">Activate Account</button>
          <button class="btn btn-sm" data-admin-action="Suspend" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;">Suspend</button>
        `;
      } else if (acc.status === "Suspended") {
        actionButtons = `
          <button class="btn btn-primary btn-sm" data-admin-action="Restore">Restore Account</button>
          <button class="btn btn-secondary btn-sm" data-admin-action="Deactivate">Deactivate</button>
        `;
      } else if (acc.status === "Pending Review" || acc.status === "Pending Activation") {
        actionButtons = `
          <button class="btn btn-primary btn-sm" data-admin-action="Activate">Approve &amp; Activate</button>
          <button class="btn btn-secondary btn-sm" data-admin-action="Deactivate">Reject / Deactivate</button>
          <button class="btn btn-sm" data-admin-action="Suspend" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;">Suspend</button>
        `;
      }
      adminActionsContainer.innerHTML = actionButtons;
    }

    // 2. Related Records Tab
    const recContainer = $("#acmRelatedRecordsContainer");
    let recordCount = 0;

    if (recContainer) {
      if (typeKey === "customers") {
        const linkedApp = db.data.applications.find(a => a.customerId === acc.id || a.id === acc.appId || (a.customer && a.customer.toLowerCase() === acc.name.toLowerCase()));
        const linkedJob = db.data.installations.find(j => (linkedApp && j.appId === linkedApp.id) || (j.customer && j.customer.toLowerCase() === acc.name.toLowerCase()));
        const linkedTickets = db.data.support.filter(s => {
          const nameMatch = (s.accountName && s.accountName.toLowerCase() === acc.name.toLowerCase()) ||
            (s.customer && s.customer.toLowerCase() === acc.name.toLowerCase());
          const idMatch = (acc.appId && (s.relatedId === acc.appId || s.appId === acc.appId)) ||
            (s.relatedId === acc.id);
          return Boolean(nameMatch || idMatch);
        });

        let html = "";
        if (linkedApp) {
          recordCount++;
          html += `
            <div class="panel" style="padding:14px; margin-bottom:14px; border:1px solid var(--line); border-radius:var(--radius-md);">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                <div>
                  <span style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--muted); letter-spacing:0.5px;">Linked Solar Application</span>
                  <div style="font-size:15px; font-weight:800; color:var(--ink); margin-top:2px;">${linkedApp.id} &bull; ${linkedApp.system}</div>
                </div>
                <button class="btn btn-secondary btn-sm" data-goto-app="${linkedApp.id}">Inspect Application &rarr;</button>
              </div>
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:10px; font-size:12px; margin-top:8px;">
                <div><span style="color:var(--muted);">Current Stage:</span> <strong>${safeText(stageGroupOf(linkedApp.stage))}</strong></div>
                <div><span style="color:var(--muted);">Financer:</span> <strong>${linkedApp.financer}</strong></div>
                <div><span style="color:var(--muted);">Installer:</span> <strong>${linkedApp.installer}</strong></div>
                <div><span style="color:var(--muted);">Total Amount:</span> <strong>${peso(linkedApp.amount)}</strong></div>
                <div><span style="color:var(--muted);">Payment:</span> <span class="status-pill ${getStatusClass(linkedApp.paymentStatus)}">${linkedApp.paymentStatus}</span></div>
              </div>
            </div>
          `;
        }

        if (linkedJob) {
          recordCount++;
          html += `
            <div class="panel" style="padding:14px; margin-bottom:14px; border:1px solid var(--line); border-radius:var(--radius-md);">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                <div>
                  <span style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--muted); letter-spacing:0.5px;">Assigned Installation Project</span>
                  <div style="font-size:15px; font-weight:800; color:var(--ink); margin-top:2px;">${linkedJob.id} &bull; ${linkedJob.system}</div>
                </div>
                <button class="btn btn-secondary btn-sm" data-goto-job="${linkedJob.id}">${linkedJob.status === "Completed" ? "View Details &rarr;" : "Inspect Installation &rarr;"}</button>
              </div>
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:10px; font-size:12px; margin-top:8px;">
                <div><span style="color:var(--muted);">Status:</span> <span class="status-pill ${getStatusClass(linkedJob.status)}">${linkedJob.status}</span></div>
                <div><span style="color:var(--muted);">Schedule:</span> <strong>${linkedJob.schedule}</strong></div>
                <div><span style="color:var(--muted);">Installer:</span> <strong>${linkedJob.installer}</strong></div>
                <div><span style="color:var(--muted);">Team Lead:</span> <strong>${linkedJob.leadTech || 'Unassigned'}</strong></div>
              </div>
            </div>
          `;
        }

        if (linkedTickets.length) {
          recordCount += linkedTickets.length;
          html += `
            <div class="panel" style="padding:14px; margin-bottom:14px; border:1px solid var(--line); border-radius:var(--radius-md);">
              <span style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--muted); letter-spacing:0.5px; display:block; margin-bottom:8px;">Customer Support Inquiries (${linkedTickets.length})</span>
              ${linkedTickets.map(t => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line); font-size:12px;">
                  <div><strong>${t.id}:</strong> ${t.concern || t.subject || 'Support Inquiry'}</div>
                  <div><span class="status-pill ${getStatusClass(t.status)}">${t.status}</span></div>
                </div>
              `).join("")}
            </div>
          `;
        }

        recContainer.innerHTML = html || `<div style="text-align:center; padding:32px; color:var(--muted); font-size:12.5px;">No active applications or installation projects currently linked to this customer account.</div>`;

      } else if (typeKey === "financers") {
        const financedApps = db.data.applications.filter(a => a.financerId === acc.id || a.financer.toLowerCase() === acc.name.toLowerCase());
        recordCount = financedApps.length;

        if (!financedApps.length) {
          recContainer.innerHTML = `<div style="text-align:center; padding:32px; color:var(--muted); font-size:12.5px;">No loan accounts or financed applications currently registered under ${acc.name}.</div>`;
        } else {
          recContainer.innerHTML = `
            <div style="font-size:12px; color:var(--muted); margin-bottom:10px;">
              Direct integration with centralized financing and payment records (${financedApps.length} active credit contracts):
            </div>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>App ID</th>
                    <th>Customer</th>
                    <th>System</th>
                    <th>Loan Amount</th>
                    <th>Monthly Amort.</th>
                    <th>Repayment</th>
                    <th>Revenue Owner</th>
                    <th style="text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${financedApps.map(a => `
                    <tr>
                      <td><span class="record-id">${a.id}</span></td>
                      <td><strong>${a.customer}</strong><span class="sub-info">${a.location}</span></td>
                      <td>${a.system}</td>
                      <td><strong>${peso(a.amount)}</strong></td>
                      <td>${peso(a.monthly)}/mo</td>
                      <td><span class="status-pill ${getStatusClass(a.paymentStatus)}">${a.paymentStatus}</span></td>
                      <td>${contractOwnerPill(db.getFinancerContract(acc))}</td>
                      <td style="text-align:right;">
                        <button class="btn btn-secondary btn-sm" data-goto-app="${a.id}">Inspect &rarr;</button>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `;
        }

      } else if (typeKey === "installers") {
        const isInternal = acc.id === "INS-001" || acc.type === "Internal";
        const assignedJobs = db.data.installations.filter(j =>
          (j.installer && j.installer.toLowerCase() === acc.name.toLowerCase()) ||
          (isInternal && j.installerType === "Hello Solar Direct")
        );
        recordCount = assignedJobs.length;

        if (!assignedJobs.length) {
          recContainer.innerHTML = `<div style="text-align:center; padding:32px; color:var(--muted); font-size:12.5px;">No installation projects currently assigned to this contractor.</div>`;
        } else {
          recContainer.innerHTML = `
            <div style="font-size:12px; color:var(--muted); margin-bottom:10px;">
              Assigned installation contracts and field operations (${assignedJobs.length} projects):
            </div>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Customer</th>
                    <th>Location</th>
                    <th>System</th>
                    <th>Status</th>
                    <th>Schedule</th>
                    <th style="text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${assignedJobs.map(j => `
                    <tr>
                      <td><span class="record-id">${j.id}</span></td>
                      <td><strong>${j.customer}</strong><span class="sub-info">${j.appId || 'Direct'}</span></td>
                      <td>${j.location}</td>
                      <td><strong>${j.system}</strong></td>
                      <td><span class="status-pill ${getStatusClass(j.status)}">${j.status}</span></td>
                      <td><span style="font-size:12px;">${(j.schedule || '').replace(/\s*\(Delayed\)/gi, '')}</span></td>
                      <td style="text-align:right;">
                        <button class="btn btn-secondary btn-sm" data-goto-job="${j.id}">${j.status === "Completed" ? "View Details &rarr;" : "Inspect &rarr;"}</button>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `;
        }

      } else if (typeKey === "merchants") {
        recordCount = acc.projects || 4;
        recContainer.innerHTML = `
          <div style="font-size:12px; color:var(--muted); margin-bottom:10px;">
            Active equipment distribution batches and hardware fulfillment logs:
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Batch / Order ID</th>
                  <th>Supply Category</th>
                  <th>Allocated Capacity</th>
                  <th>Order Volume</th>
                  <th>Delivery Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span class="record-id">ORD-9021</span></td>
                  <td>Tier-1 Monocrystalline Solar Panels</td>
                  <td>45 kW staged</td>
                  <td><strong>${peso(980000)}</strong></td>
                  <td><span class="status-pill success">Delivered</span></td>
                </tr>
                <tr>
                  <td><span class="record-id">ORD-9024</span></td>
                  <td>Hybrid String Inverters (5kW - 10kW)</td>
                  <td>8 Units</td>
                  <td><strong>${peso(540000)}</strong></td>
                  <td><span class="status-pill success">Delivered</span></td>
                </tr>
                <tr>
                  <td><span class="record-id">ORD-9033</span></td>
                  <td>Anodized Aluminum Roof Racking Hardware</td>
                  <td>12 Residential Sets</td>
                  <td><strong>${peso(210000)}</strong></td>
                  <td><span class="status-pill warn">In Transit</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }
    }
    if ($("#acmRecordCount")) $("#acmRecordCount").textContent = recordCount;

    // 3. Activity Tab
    const actTimeline = $("#acmActivityTimeline");
    const accountActs = db.getAccountActivity(acc.id);
    // Also include activity by name or type
    const relatedActs = db.data.activity.filter(a =>
      a.record === acc.id ||
      (a.action && (a.action.includes(acc.id) || a.action.includes(acc.name)))
    );
    const combinedActs = Array.from(new Set([...accountActs, ...relatedActs]));
    if ($("#acmActCount")) $("#acmActCount").textContent = combinedActs.length;

    if (actTimeline) {
      if (!combinedActs.length) {
        actTimeline.innerHTML = `<div style="color:var(--muted); font-size:12px; padding:16px 0; text-align:center;">No activity logged yet for this account.</div>`;
      } else {
        actTimeline.innerHTML = combinedActs.map(item => `
          <div class="timeline-node">
            <div class="timeline-meta">
              <span class="record-tag">${calculateRelativeTime(item.timestamp || item.exactTime) || item.exactTime || item.time || "Recent"}</span>
              <span>•</span>
              <strong style="color:var(--ink);">${item.user || item.role}</strong>
            </div>
            <div class="timeline-title">${item.action}</div>
          </div>
        `).join("");
      }
    }

    $("#accountModal")?.classList.add("open");
  }

  // --- ADMINISTRATIVE ACTIONS (Activate, Deactivate, Suspend, Restore) ---
  let pendingAdminAction = null;

  function openAccountActionConfirmModal(action) {
    if (!state.selectedAccountId) return;
    const { typeKey, id } = state.selectedAccountId;
    let list = [];
    if (typeKey === "customers") list = db.data.customers;
    else if (typeKey === "financers") list = db.data.financers;
    else if (typeKey === "installers") list = db.data.installers;
    else if (typeKey === "merchants") list = db.data.merchants;
    else if (typeKey === "engineers") list = db.data.engineers || [];
    else if (typeKey === "accountants") list = db.data.accountants || [];

    const acc = list.find(a => a.id === id);
    if (!acc) return;

    pendingAdminAction = { action, typeKey, id, name: acc.name };
    const roleName = typeKey.slice(0, -1).toUpperCase();

    if ($("#acmConfirmEyebrow")) $("#acmConfirmEyebrow").textContent = `ADMINISTRATIVE CONTROL / ${action.toUpperCase()}`;
    if ($("#acmConfirmTitle")) $("#acmConfirmTitle").textContent = `${action} ${roleName} Account?`;

    let msg = "";
    if (action === "Suspend") {
      msg = `Are you sure you want to suspend account ${acc.id} (${acc.name})? All portal operations and permissions will be temporarily frozen pending compliance review. Historical applications, installations, and transactions will remain intact.`;
    } else if (action === "Deactivate") {
      msg = `Are you sure you want to deactivate account ${acc.id} (${acc.name})? Stakeholder portal login access will be disabled. Historical data and linked relationships are preserved.`;
    } else if (action === "Restore" || action === "Activate") {
      msg = `Are you sure you want to activate/restore account ${acc.id} (${acc.name})? Full portal access and active operational capabilities will be restored.`;
    }
    if ($("#acmConfirmMessage")) $("#acmConfirmMessage").textContent = msg;
    if ($("#acmActionReasonInput")) $("#acmActionReasonInput").value = "";

    const btn = $("#btnConfirmAccountAction");
    if (btn) {
      btn.textContent = `Confirm ${action}`;
      if (action === "Suspend" || action === "Deactivate") {
        btn.style.background = "var(--danger)";
        btn.style.borderColor = "var(--danger)";
      } else {
        btn.style.background = "";
        btn.style.borderColor = "";
      }
    }

    $("#accountActionConfirmModal")?.classList.add("open");
  }

  function executeAccountAction() {
    if (!pendingAdminAction) return;
    const { action, typeKey, id, name } = pendingAdminAction;
    let targetStatus = "Active";
    if (action === "Deactivate") targetStatus = "Inactive";
    else if (action === "Suspend") targetStatus = "Suspended";
    else if (action === "Activate" || action === "Restore") targetStatus = "Active";

    const reason = $("#acmActionReasonInput")?.value?.trim() || "";
    db.updateAccountStatus(typeKey, id, targetStatus, reason);

    $("#accountActionConfirmModal")?.classList.remove("open");
    showToast(`Account ${id} (${name}) status updated to "${targetStatus}"`, targetStatus === "Active" ? "success" : "danger", "👤");
    openAccountModal(typeKey, id);
    renderAccounts();
  }

  // --- EXPORT DIRECTORY MODAL & CSV GENERATION ---
  function openExportAccountsModal() {
    const tabLabels = {
      customers: "Customers",
      financers: "Financers",
      installers: "Installers",
      merchants: "Merchants",
      engineers: "Engineers"
    };
    const currentLabel = tabLabels[state.accountCurrentTab] || "Customers";
    const currentCount = (db.data[state.accountCurrentTab] || []).length;
    const totalCount = db.data.customers.length + db.data.financers.length + db.data.installers.length + db.data.merchants.length;

    if ($("#exportScopeCurrentLabel")) $("#exportScopeCurrentLabel").textContent = currentLabel;
    if ($("#exportScopeCurrentCount")) $("#exportScopeCurrentCount").textContent = currentCount;
    if ($("#exportScopeAllCount")) $("#exportScopeAllCount").textContent = totalCount;

    $("#exportAccountsModal")?.classList.add("open");
  }

  function executeExportAccounts() {
    const scopeRadio = document.querySelector('input[name="exportScope"]:checked');
    const scope = scopeRadio ? scopeRadio.value : "current";
    const tab = state.accountCurrentTab;

    function cleanCsv(val) {
      if (val === undefined || val === null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }

    let csvRows = [];
    let filename = "";

    if (scope === "current") {
      filename = `hellosolar-${tab}-directory-${new Date().toISOString().slice(0, 10)}.csv`;
      if (tab === "customers") {
        csvRows.push("Customer ID,Name,Email,Phone,Location,System Size,Linked Application,Status,Joined Date");
        db.data.customers.forEach(c => {
          csvRows.push([cleanCsv(c.id), cleanCsv(c.name), cleanCsv(c.email), cleanCsv(c.phone), cleanCsv(c.location), cleanCsv(c.system), cleanCsv(c.appId), cleanCsv(c.status), cleanCsv(c.joined)].join(","));
        });
      } else if (tab === "financers") {
        csvRows.push("Financer ID,Institution Name,Contact Person,Email,Phone,Active Loans,Total Funded (PHP),Status,Contract Term (Months),Annual Rate (%),Contract Start,Contract End,Contract Status,Funding/Revenue Owner");
        db.data.financers.forEach(f => {
          const c = db.getFinancerContract(f);
          csvRows.push([cleanCsv(f.id), cleanCsv(f.name), cleanCsv(f.contact), cleanCsv(f.email), cleanCsv(f.phone), cleanCsv(f.activeLoans), cleanCsv(f.totalFunded), cleanCsv(f.status), cleanCsv(c.termMonths), cleanCsv(c.annualRate), cleanCsv(c.startDate), cleanCsv(c.endDate), cleanCsv(c.status), cleanCsv(c.ownerName)].join(","));
        });
      } else if (tab === "installers") {
        csvRows.push("Installer ID,Company or Team,Installer Model,Contact Lead,Email,Phone,Active Jobs,Completed Jobs,Rating,Status");
        db.data.installers.forEach(i => {
          const model = i.type === "Internal" ? "Hello Solar Installation" : "Partner Installer";
          const compName = i.type === "Internal" ? "Hello Solar Internal Team" : i.name;
          csvRows.push([cleanCsv(i.id), cleanCsv(compName), cleanCsv(model), cleanCsv(i.contact), cleanCsv(i.email), cleanCsv(i.phone), cleanCsv(i.activeJobs), cleanCsv(i.completedJobs), cleanCsv(i.rating), cleanCsv(i.status)].join(","));
        });
      } else if (tab === "merchants") {
        csvRows.push("Merchant ID,Business Name,Contact Person,Email,Phone,Active Projects,Transactions,Processed Volume (PHP),Status");
        db.data.merchants.forEach(m => {
          csvRows.push([cleanCsv(m.id), cleanCsv(m.name), cleanCsv(m.contact), cleanCsv(m.email), cleanCsv(m.phone), cleanCsv(m.projects), cleanCsv(m.transactions), cleanCsv(m.volume), cleanCsv(m.status)].join(","));
        });
      }
    } else {
      filename = `hellosolar-all-stakeholders-directory-${new Date().toISOString().slice(0, 10)}.csv`;
      csvRows.push("Account ID,Account Type,Name or Institution,Contact Person,Email,Phone,Location,Linked Records,Key Metric,Status");
      db.data.customers.forEach(c => {
        csvRows.push([cleanCsv(c.id), cleanCsv("Customer"), cleanCsv(c.name), cleanCsv(c.name), cleanCsv(c.email), cleanCsv(c.phone), cleanCsv(c.location), cleanCsv(c.appId), cleanCsv(c.system), cleanCsv(c.status)].join(","));
      });
      db.data.financers.forEach(f => {
        csvRows.push([cleanCsv(f.id), cleanCsv("Financer"), cleanCsv(f.name), cleanCsv(f.contact), cleanCsv(f.email), cleanCsv(f.phone), cleanCsv("National"), cleanCsv(`${f.activeLoans} loans`), cleanCsv(`₱${f.totalFunded}`), cleanCsv(f.status)].join(","));
      });
      db.data.installers.forEach(i => {
        const compName = i.type === "Internal" ? "Hello Solar Internal Team" : i.name;
        csvRows.push([cleanCsv(i.id), cleanCsv("Installer"), cleanCsv(compName), cleanCsv(i.contact), cleanCsv(i.email), cleanCsv(i.phone), cleanCsv("Visayas"), cleanCsv(`${i.activeJobs} active / ${i.completedJobs} done`), cleanCsv(`Rating ${i.rating}`), cleanCsv(i.status)].join(","));
      });
      db.data.merchants.forEach(m => {
        csvRows.push([cleanCsv(m.id), cleanCsv("Merchant"), cleanCsv(m.name), cleanCsv(m.contact), cleanCsv(m.email), cleanCsv(m.phone), cleanCsv("Cebu / National"), cleanCsv(`${m.projects} projects`), cleanCsv(`₱${m.volume}`), cleanCsv(m.status)].join(","));
      });
    }

    const blob = new Blob([csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    $("#exportAccountsModal")?.classList.remove("open");
    showToast(`Directory exported successfully as CSV`, "success", "↓");
  }

  // ==================== 5. PAYMENTS PAGE ====================
  function renderPayments() {
    if (typeof db.syncFinancerContracts === "function") db.syncFinancerContracts();
    const apps = db.getApplications ? db.getApplications() : db.data.applications;
    const fundingOf = app => (typeof db.getApplicationFunding === "function" ? db.getApplicationFunding(app) : { isFinanced: false });

    // 1. KPI Cards (Only 3 equal-width cards: Total Portfolio Value, Expected Revenue, Overdue Accounts)
    // Single source of truth shared with Accounting: getCurrentPaymentsKpis() refreshes installment payment
    // statuses from the schedules, then runs getPaymentsKpis() (current-period revenue split by contract owner).
    if (typeof db.getCurrentPaymentsKpis !== "function") {
      console.warn("Hello Solar: data.js is outdated (cached). Hard-refresh the page to load the current Payments KPI calculation.");
    }
    const kpis = db.getCurrentPaymentsKpis();

    // Recomputed on every render from today's date (no stored snapshot), so the figures update daily.
    if ($("#payTotalPortfolioValue")) $("#payTotalPortfolioValue").textContent = peso(kpis.totalPortfolio);
    if ($("#payPortfolioAsOf")) $("#payPortfolioAsOf").textContent = `as of ${kpis.asOfLabel}`;
    if ($("#payHsFunded")) $("#payHsFunded").textContent = peso(kpis.portfolioHsFunded);
    if ($("#payThirdPartyFunded")) $("#payThirdPartyFunded").textContent = peso(kpis.financerFunded);

    if ($("#payExpectedRevenue")) $("#payExpectedRevenue").textContent = peso(kpis.paymentsReceived ?? kpis.financingRevenue);
    if ($("#payRevenueSince")) {
      $("#payRevenueSince").textContent = kpis.revenueSince
        ? `Since ${formatReadableDate(kpis.revenueSince)} – ${formatReadableDate(kpis.revenueTo)}`
        : "No payments collected yet";
    }
    if ($("#payHsRevenue")) $("#payHsRevenue").textContent = peso(kpis.paymentsHsShare ?? kpis.financingHsRevenue);
    if ($("#payThirdPartyRevenue")) $("#payThirdPartyRevenue").textContent = peso(kpis.financerRevenue);

    if ($("#payOverdueCount")) $("#payOverdueCount").textContent = kpis.overdueCount;
    if ($("#payOverdueActionStatus")) $("#payOverdueActionStatus").textContent = kpis.overdueActionStatus;

    // 2. Filter payments table
    const filtered = apps.filter(app => {
      let matchStatus = true;
      if (state.paymentStatusFilter === "Verification Required") {
        matchStatus = (app.paymentStatus || "").includes("Verification Required") || !!db.getPendingInstallmentReceipt(app.id);
      } else if (state.paymentStatusFilter === "On Time") {
        matchStatus = app.paymentStatus === "On Time";
      } else if (state.paymentStatusFilter === "Due Soon") {
        matchStatus = app.paymentStatus === "Due Soon";
      } else if (state.paymentStatusFilter === "Overdue") {
        matchStatus = (app.paymentStatus || "").includes("Overdue");
      } else if (state.paymentStatusFilter === "Completed") {
        matchStatus = (app.paymentStatus || "").includes("Completed") || (app.paymentStatus || "").includes("Verified") || (app.paymentStatus || "").includes("Paid");
      } else if (state.paymentStatusFilter && state.paymentStatusFilter !== "All") {
        matchStatus = app.paymentStatus === state.paymentStatusFilter;
      }

      const q = (state.paymentSearchQuery || "").toLowerCase().trim();
      const funding = q ? fundingOf(app) : null;
      const matchSearch = !q || (
        (funding.ownerName && funding.ownerName.toLowerCase().includes(q)) ||
        (funding.contractStatus && funding.contractStatus.toLowerCase().includes(q)) ||
        (app.id && app.id.toLowerCase().includes(q)) ||
        (app.customer && app.customer.toLowerCase().includes(q)) ||
        (app.paymentType && app.paymentType.toLowerCase().includes(q)) ||
        (app.financer && app.financer.toLowerCase().includes(q)) ||
        (app.paymentStatus && app.paymentStatus.toLowerCase().includes(q))
      );
      return matchStatus && matchSearch;
    });

    const tbody = $("#paymentTableBody");
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--muted);">No payment records matching filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(app => {
      const isFull = (app.paymentType || "").toLowerCase().includes("full") || app.financer === "Not Required";
      const paymentType = isFull ? "Full Payment" : "Installment";

      // Due / Uploaded Date display
      let dueDisplay = "";
      if (isFull) {
        if (app.receiptUploadedAt) {
          dueDisplay = `<span style="font-weight:600;">Uploaded: ${formatReadableDate(app.receiptUploadedAt)}</span>`;
        } else if (app.paymentStatus === "Completed" || app.paymentStatus === "Verified" || app.paymentStatus === "Paid" || app.paymentStatus === "Verified / Paid") {
          dueDisplay = `<span class="status-pill success sa-pill-xs">Paid in Full</span>`;
        } else {
          dueDisplay = `<span class="sa-dim">Awaiting Upload</span>`;
        }
      } else {
        if (app.paymentStatus === "Completed") {
          dueDisplay = `<span class="status-pill success sa-pill-xs">Paid in Full</span>`;
        } else {
          dueDisplay = `<span style="font-weight:600;">${formatReadableDate(app.nextDue)}</span>`;
        }
      }

      // Amount display
      let amountDisplay = "";
      if (isFull) {
        amountDisplay = `<strong>${peso(app.amount)}</strong><span class="sub-info">Full Payment</span>`;
      } else {
        amountDisplay = `<strong>${peso(app.amount)}</strong><span class="sub-info sa-accent">${peso(app.monthly)} / mo</span>`;
      }

      // Action button
      let actionBtn = "";
      if (isFull) {
        if (app.paymentStatus === "Verification Required") {
          actionBtn = `<button class="btn btn-primary btn-sm" data-review-receipt="${app.id}">Review Receipt</button>`;
        } else if (app.paymentStatus === "Verified" || app.paymentStatus === "Completed" || app.paymentStatus === "Paid") {
          actionBtn = `<button class="btn btn-secondary btn-sm" data-review-receipt="${app.id}">View Receipt</button>`;
        } else {
          actionBtn = `<button class="btn btn-secondary btn-sm" data-review-receipt="${app.id}">Review</button>`;
        }
      } else {
        actionBtn = db.getPendingInstallmentReceipt(app.id)
          ? `<button class="btn btn-primary btn-sm" data-view-payment="${app.id}">Review Receipt</button>`
          : `<button class="btn btn-secondary btn-sm" data-view-payment="${app.id}">View Payment</button>`;
      }

      return `
        <tr>
          <td><span class="record-id">${app.id}</span></td>
          <td><strong>${app.customer}</strong><span class="sub-info">${app.location}</span></td>
          <td>
            ${paymentTypePill(paymentType, "sa-pill-xs")}
            ${paymentDownPaymentLine(app)}
            ${renderPaymentFundingInfo(fundingOf(app))}
          </td>
          <td>${amountDisplay}</td>
          <td><span class="status-pill ${getStatusClass(app.paymentStatus)}">${app.paymentStatus}</span></td>
          <td>${dueDisplay}</td>
          <td style="text-align: right;">
            ${actionBtn}
          </td>
        </tr>
      `;
    }).join("");
  }

  // Down payment under the payment type: ₱500 Full Payment / ₱10,000 Installment
  function paymentDownPaymentLine(app) {
    const st = db.downPaymentState(app);
    const cls = st === "Verified" ? "success" : (st === "Pending Verification" ? "warn" : "neutral");
    const label = st;
    return `<span class="pay-dp-line">Down payment: <strong>${safeText(peso(db.downPaymentAmount(app)))}</strong> <span class="status-pill ${cls}" style="font-size:10px; padding:1px 7px;">${safeText(label)}</span></span>`;
  }

  // ==================== ACCOUNTING / ANALYTICS (Super Admin only) ====================
  // ─────────────────────────────────────────────────────────────────────────
  // DOWN PAYMENT (drawer pill)
  // ─────────────────────────────────────────────────────────────────────────
  function drawerDownPaymentInfo(app) {
    const hasField = app.downPaymentStatus !== undefined;
    if (!hasField && !(!db.isFullPaymentApp(app) && Number(app.downPayment) > 0)) return null;
    const amount = peso(db.downPaymentAmount(app));
    const st = db.downPaymentState(app);
    if (app.refund && app.refund.status === "Refunded") return { cls: "neutral", text: `DP ${amount} · Refunded`, title: "Down payment refunded" };
    if (st === "Verified") return { cls: "success", text: `DP ${amount} received`, title: "Down payment received and verified" };
    if (st === "Pending Verification") return { cls: "warn", text: `DP ${amount} · Pending`, title: "Down payment receipt awaiting verification" };
    return { cls: "neutral", text: "DP not received", title: "No down payment received yet" };
  }

  // Opens an uploaded receipt / document (browsers block opening data: URLs directly)
  // Receipt / attachment preview modal with a download icon (images and PDFs preview inline)
  function openStoredFile(dataUrl, options = {}) {
    if (!dataUrl) {
      showToast("The file preview is not available for this record.", "warn", "⚠");
      return;
    }
    const modal = $("#receiptPreviewModal");
    const preview = $("#rpmPreview");
    if (!modal || !preview) {
      fetch(dataUrl).then(r => r.blob()).then(blob => window.open(URL.createObjectURL(blob), "_blank"));
      return;
    }
    const mime = (String(dataUrl).match(/^data:([^;,]+)/) || [])[1] || "";
    const ext = mime === "application/pdf" ? "pdf" : (mime.split("/")[1] || "file").replace("jpeg", "jpg");
    const name = options.fileName || `receipt.${ext}`;
    if ($("#rpmTitle")) $("#rpmTitle").textContent = options.title || name;
    if ($("#rpmEyebrow")) $("#rpmEyebrow").textContent = options.eyebrow || "PAYMENT PROOF";
    const download = $("#rpmDownload");
    if (download) { download.href = dataUrl; download.setAttribute("download", name); }
    preview.innerHTML = "";
    if (mime.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = name;
      preview.appendChild(img);
    } else if (mime === "application/pdf") {
      const frame = document.createElement("iframe");
      frame.src = dataUrl;
      frame.title = name;
      preview.appendChild(frame);
    } else {
      preview.innerHTML = `<p class="sub-info">No preview for this file type. Use the download icon to save ${safeText(name)}.</p>`;
    }
    modal.classList.add("open");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SITE VISITS
  // ─────────────────────────────────────────────────────────────────────────
  const SV_STATUS_CLASS = { "Pending Assignment": "warn", Scheduled: "direct", Completed: "success", Cancelled: "danger" };
  const svDate = (d, t) => {
    if (!d) return "—";
    const dt = new Date(`${d}T${t || "00:00"}`);
    if (Number.isNaN(dt.getTime())) return d;
    const date = dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    return t ? `${date} · ${dt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}` : date;
  };

  function visibleSiteVisits() {
    const list = db.getSiteVisits ? db.getSiteVisits() : [];
    if (!IS_ENGINEER) return list;
    return list.filter(v => v.assignee && v.assignee.type === "engineer" && v.assignee.refId === ENGINEER.actorId);
  }

  function assigneeLabel(v) {
    if (!v.assignee) return `<span class="sub-info">Not assigned</span>`;
    const type = { installer: "Installer", engineer: "Engineer", other: "Other" }[v.assignee.type] || "";
    const doc = v.assignee.document ? ` · <button type="button" class="link-btn" data-sv-doc="${safeText(v.id)}">ID</button>` : "";
    return `<div class="sv-assignee"><strong>${safeText(v.assignee.name)}</strong><small>${type}${v.assignee.phone ? ` · ${safeText(v.assignee.phone)}` : ""}${doc}</small></div>`;
  }

  function assigneeOptions(selected) {
    const { installers, engineers } = db.getSiteVisitAssignees();
    const opt = (val, label) => `<option value="${safeText(val)}" ${val === selected ? "selected" : ""}>${safeText(label)}</option>`;
    return opt("", "— Choose who visits —") +
      `<optgroup label="Registered Installers">${installers.map(i => opt(`installer:${i.id}`, `${i.name}${i.type === "Internal" ? " (Internal)" : ""}`)).join("")}</optgroup>` +
      `<optgroup label="Engineers">${engineers.length ? engineers.map(e => opt(`engineer:${e.id}`, e.name)).join("") : `<option disabled>No engineer accounts yet</option>`}</optgroup>` +
      `<optgroup label="Others">${opt("other", "Other person (upload ID)…")}</optgroup>`;
  }

  function assigneeValue(v) {
    if (!v.assignee) return "";
    return v.assignee.type === "other" ? "other" : `${v.assignee.type}:${v.assignee.refId}`;
  }

  function renderOverviewSiteVisits() {
    const body = $("#overviewSiteVisitsBody");
    if (!body) return;
    const open = visibleSiteVisits().filter(v => v.status === "Pending Assignment" || v.status === "Scheduled")
      .sort((x, y) => String(x.scheduledDate || "9999").localeCompare(String(y.scheduledDate || "9999")));
    if ($("#overviewSiteVisitCount")) $("#overviewSiteVisitCount").textContent = open.length;
    body.innerHTML = open.length ? open.slice(0, 5).map(v => `
      <tr>
        <td><strong>${safeText(v.id)}</strong></td>
        <td>${safeText(v.customer)}</td>
        <td><span class="sub-info">${safeText(v.location)}</span></td>
        <td>${safeText(svDate(v.scheduledDate, v.scheduledTime))}</td>
        <td>${assigneeLabel(v)}</td>
        <td><span class="status-pill ${SV_STATUS_CLASS[v.status] || "neutral"}">${safeText(v.status)}</span></td>
      </tr>`).join("")
      : `<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:18px;">No upcoming site visits.</td></tr>`;
  }

  function renderSiteVisits() {
    const body = $("#siteVisitTableBody");
    if (!body) return;
    const q = ($("#siteVisitSearch")?.value || "").trim().toLowerCase();
    const filter = state.siteVisitFilter || "All";
    const stageOf = v => v.status === "Cancelled" ? "Cancelled" : db.siteVisitStage(v);
    const rows = visibleSiteVisits().filter(v => (filter === "All" || stageOf(v) === filter) &&
      (!q || [v.id, v.customer, v.location, v.phone, v.email, v.package, v.assignee && v.assignee.name].some(x => String(x || "").toLowerCase().includes(q))));
    $$("#siteVisitFilterTabs .chip-btn").forEach(b => b.classList.toggle("active", b.dataset.status === filter));
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:22px;">${IS_ENGINEER ? "No site visits assigned to you." : "No site visits yet."}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(v => {
      const open = v.status === "Pending Assignment" || v.status === "Scheduled";
      const feeCls = v.feePaymentStatus === "Verified" ? "success" : (v.feePaymentStatus === "Pending Verification" ? "warn" : "neutral");
      const fee = `<span class="status-pill ${feeCls}">${peso(v.fee || 1000)} · ${safeText(v.feePaymentStatus)}</span>` +
        (v.feeProof && v.feeProof.dataUrl ? `<div style="margin-top:4px;"><button type="button" class="link-btn" style="margin:0;" data-sv-receipt="${safeText(v.id)}">View receipt</button>` +
          (!IS_ENGINEER && v.feePaymentStatus === "Pending Verification" ? ` · <button type="button" class="link-btn" data-sv-verify="${safeText(v.id)}">Verify</button>` : "") + `</div>` : "");
      const assign = !IS_ENGINEER && open
        ? `<select class="input-field sv-assign-select" data-sv-select="${safeText(v.id)}" aria-label="Assign site visit ${safeText(v.id)}">${assigneeOptions(assigneeValue(v))}</select>
           ${v.assignee ? `<div style="margin-top:4px;">${assigneeLabel(v)}</div>` : ""}`
        : assigneeLabel(v);
      let actions = "";
      if (IS_ENGINEER) {
        actions = v.status === "Scheduled" ? `<button class="btn btn-primary btn-sm" data-sv-complete="${safeText(v.id)}">Mark Completed</button>` : "—";
      } else if (v.status === "Pending Assignment") {
        actions = `<button class="btn btn-primary btn-sm" data-sv-assign="${safeText(v.id)}">Assign</button> <button class="btn btn-secondary btn-sm" data-sv-cancel="${safeText(v.id)}">Cancel</button>`;
      } else if (v.status === "Scheduled") {
        actions = `<button class="btn btn-primary btn-sm" data-sv-complete="${safeText(v.id)}">Confirm Visit</button> <button class="btn btn-secondary btn-sm" data-sv-cancel="${safeText(v.id)}">Cancel</button>`;
      } else if (v.status === "Completed") {
        actions = v.continueLink
          ? `<button class="btn btn-secondary btn-sm" data-sv-copylink="${safeText(v.id)}">Copy Link</button> <a class="btn btn-secondary btn-sm" href="../${safeText(v.continueLink)}" target="_blank" rel="noopener">Open</a>`
          : `<button class="btn btn-primary btn-sm" data-sv-sendlink="${safeText(v.id)}">Send Link</button>`;
      } else {
        actions = "—";
      }
      const preferred = v.preferredDate && v.preferredDate !== v.scheduledDate ? `<span class="sub-info">Preferred: ${safeText(svDate(v.preferredDate))}</span>` : "";
      return `
        <tr>
          <td><strong>${safeText(v.id)}</strong><span class="sub-info">${safeText(v.customer)} · ${safeText(v.phone)}</span></td>
          <td><span style="font-size:12.5px;">${safeText(v.location)}</span><span class="sub-info">${safeText(v.package || "")}</span></td>
          <td>${safeText(svDate(v.scheduledDate, v.scheduledTime))}${preferred}</td>
          <td>${fee}</td>
          <td>${assign}</td>
          <td>${siteVisitLifecycleHtml(v)}</td>
          <td style="text-align:right; white-space:nowrap;">${actions}</td>
        </tr>`;
    }).join("");
  }

  // Site Visit Payment → Pending Visit → Visit Confirmed (+ the client's answer to the continue link)
  function siteVisitLifecycleHtml(v) {
    if (v.status === "Cancelled") return `<span class="status-pill danger">Cancelled</span>`;
    const steps = ["Site Visit Payment", "Pending Visit", "Visit Confirmed"];
    const cur = steps.indexOf(db.siteVisitStage(v));
    const pills = steps.map((stp, i) => {
      const cls = i < cur || (i === 2 && cur === 2) ? "done" : (i === cur ? "current" : "");
      return `<span class="sv-step ${cls}">${i < cur || (i === 2 && cur === 2) ? "✓ " : ""}${stp}</span>`;
    }).join(`<span class="sv-step-sep">›</span>`);
    let extra = "";
    if (v.status === "Completed") {
      const resp = v.continueResponse || (v.continueLink ? "Awaiting Response" : "Link not sent");
      const cls = /^Yes/.test(resp) ? "success" : (/^No/.test(resp) ? "danger" : "warn");
      extra = `<div class="sv-continue">Continue link: <span class="status-pill ${cls}" style="font-size:10.5px;">${safeText(resp)}</span>${v.continueLinkSentAt ? ` · sent ${safeText(svDate(v.continueLinkSentAt.slice(0, 10)))}` : ""}</div>`;
    } else if (v.status === "Scheduled") {
      extra = `<div class="sv-continue">Visit scheduled</div>`;
    } else if (v.feePaymentStatus === "Verified") {
      extra = `<div class="sv-continue">Fee verified · assign who visits</div>`;
    }
    return `<div class="sv-lifecycle">${pills}</div>${extra}`;
  }

  let svaVisitId = null;
  function openSiteVisitAssignModal(visitId, preset) {
    const v = db.getSiteVisits().find(x => x.id === visitId);
    if (!v) return;
    svaVisitId = visitId;
    $("#svaVisitId").textContent = v.id;
    $("#svaClient").textContent = `${v.customer} · ${v.phone}`;
    $("#svaLocation").textContent = v.location || "—";
    const sel = $("#svaAssignee");
    sel.innerHTML = assigneeOptions(preset !== undefined ? preset : assigneeValue(v));
    $("#svaDate").value = v.scheduledDate || v.preferredDate || "";
    $("#svaTime").value = v.scheduledTime || "";
    $("#svaOtherName").value = v.assignee && v.assignee.type === "other" ? v.assignee.name : "";
    $("#svaOtherPhone").value = v.assignee && v.assignee.type === "other" ? v.assignee.phone : "";
    $("#svaOtherDoc").value = "";
    $("#svaOtherFields").style.display = sel.value === "other" ? "block" : "none";
    $("#svaError").style.display = "none";
    $("#siteVisitAssignModal").classList.add("open");
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(file);
    });
  }

  async function confirmSiteVisitAssign() {
    const err = msg => { $("#svaError").textContent = msg; $("#svaError").style.display = msg ? "block" : "none"; };
    const value = $("#svaAssignee").value;
    if (!value) return err("Choose who will do the site visit.");
    const assignment = { scheduledDate: $("#svaDate").value, scheduledTime: $("#svaTime").value };
    if (value === "other") {
      assignment.type = "other";
      assignment.name = $("#svaOtherName").value;
      assignment.phone = $("#svaOtherPhone").value;
      const file = $("#svaOtherDoc").files && $("#svaOtherDoc").files[0];
      const v = db.getSiteVisits().find(x => x.id === svaVisitId);
      if (file) {
        if (file.size > 5 * 1024 * 1024) return err("The document must be 5 MB or smaller.");
        if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) return err("Upload a JPG, PNG or PDF file.");
        try {
          assignment.document = { fileName: file.name, fileType: file.type, dataUrl: await readFileAsDataUrl(file) };
        } catch (e) { return err("Could not read the document. Try another file."); }
      } else if (v && v.assignee && v.assignee.type === "other" && v.assignee.document) {
        assignment.document = v.assignee.document; // keep the document already on file
      }
    } else {
      const [type, refId] = value.split(":");
      assignment.type = type;
      assignment.refId = refId;
    }
    if (!assignment.scheduledDate) return err("Choose the visit date.");
    const res = db.assignSiteVisit(svaVisitId, assignment, { adminUser: SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)" });
    if (!res.success) return err(res.error);
    $("#siteVisitAssignModal").classList.remove("open");
    showToast(`${res.visit.id} assigned to ${safeText(res.visit.assignee.name)}.`, "success", "✓");
    renderCurrentPage();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACCOUNTING: client payments (refund policy) and reimbursement requests
  // ─────────────────────────────────────────────────────────────────────────
  const ACC_PAY_CLASS = { Verified: "success", "Pending Verification": "warn", "Not Submitted": "neutral" };
  const ACC_DECISION_CLASS = { Proceeding: "success", "Not Proceeding": "danger", Awaiting: "neutral" };
  const ACC_REFUND_CLASS = { Refunded: "success", "Deducted from Price": "success", "Eligible for Refund": "warn", "Non-refundable": "danger", "Pending Decision": "neutral", "Awaiting Verification": "neutral" };

  function renderClientPayments() {
    const body = $("#accClientPaymentsBody");
    if (!body) return;
    const all = db.getClientPayments();
    const paid = all.filter(r => r.paymentStatus === "Verified").reduce((s, r) => s + r.amount, 0);
    const refunded = all.filter(r => r.refundStatus === "Refunded").reduce((s, r) => s + Number((r.refund && r.refund.amount) || r.amount), 0);
    if ($("#accClientPaid")) $("#accClientPaid").textContent = peso(paid);
    if ($("#accClientRefunded")) $("#accClientRefunded").textContent = peso(refunded);
    const q = ($("#accClientSearch")?.value || "").trim().toLowerCase();
    const rows = all.filter(r => !q || [r.ref, r.client, r.type].some(x => String(x || "").toLowerCase().includes(q)));
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--muted); padding:18px;">No client payments yet.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(r => {
      const key = `data-kind="${r.kind}" data-id="${safeText(r.id)}"`;
      let action;
      if (r.refundStatus === "Awaiting Verification") {
        action = r.paymentStatus === "Pending Verification" ? `<button class="btn btn-primary btn-sm" data-acc-verify ${key}>Verify Payment</button>` : `<span class="sub-info">No payment yet</span>`;
      } else if (r.refundStatus === "Pending Decision") {
        action = `<span class="acc-actions"><button class="btn btn-secondary btn-sm" data-acc-decision="Proceeding" ${key}>Proceeding</button><button class="btn btn-secondary btn-sm" data-acc-decision="Not Proceeding" ${key}>Not Proceeding</button></span>`;
      } else if (r.refundStatus === "Eligible for Refund") {
        action = `<span class="acc-actions"><button class="btn btn-primary btn-sm" data-acc-refund ${key}>Refund</button><button class="btn btn-secondary btn-sm" data-acc-decision="Proceeding" ${key}>Mark Proceeding</button></span>`;
      } else if (r.refundStatus === "Deducted from Price") {
        action = `<span class="acc-actions"><button class="btn btn-secondary btn-sm" data-acc-decision="Not Proceeding" ${key} title="The client did not proceed after all">Not Proceeding</button></span>`;
      } else if (r.refundStatus === "Non-refundable") {
        action = `<span class="acc-actions"><span class="sub-info" style="margin:0;">No refund</span><button class="btn btn-secondary btn-sm" data-acc-decision="Proceeding" ${key}>Mark Proceeding</button></span>`;
      } else {
        action = r.refund ? `<span class="sub-info">${safeText(r.refund.reference || r.refund.method)}<br>${safeText(svDate(String(r.refund.refundedAt || "").slice(0, 10)))}</span>` : "—";
      }
      const refLink = r.kind === "dp" ? `<button type="button" class="link-btn" style="margin:0;" data-view-app="${safeText(r.ref)}">${safeText(r.ref)}</button>` : `<strong>${safeText(r.ref)}</strong>`;
      return `
        <tr>
          <td>${refLink}</td>
          <td>${safeText(r.client)}</td>
          <td>${safeText(r.type)}</td>
          <td class="num">${peso(r.amount)}</td>
          <td><span class="status-pill ${ACC_PAY_CLASS[r.paymentStatus] || "neutral"}">${safeText(r.paymentStatus)}</span>${r.hasReceipt ? `<div><button type="button" class="link-btn" style="margin:0;" data-acc-receipt ${key}>View receipt</button></div>` : ""}</td>
          <td><span class="status-pill ${ACC_DECISION_CLASS[r.decision] || "neutral"}">${safeText(r.decision)}</span></td>
          <td><span class="status-pill ${ACC_REFUND_CLASS[r.refundStatus] || "neutral"}">${safeText(r.refundStatus)}</span></td>
          <td style="text-align:right;">${action}</td>
        </tr>`;
    }).join("");
  }

  function renderReimbursements() {
    const body = $("#accReimbursementsBody");
    if (!body) return;
    const list = db.getReimbursements();
    if ($("#accReimbPendingCount")) $("#accReimbPendingCount").textContent = list.filter(r => r.status === "Pending").length;
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:18px;">No reimbursement requests.</td></tr>`;
      return;
    }
    const cls = { Pending: "warn", Approved: "success", Declined: "danger" };
    body.innerHTML = list.map(r => {
      const action = r.status === "Pending"
        ? `<span class="acc-actions"><button class="btn btn-primary btn-sm" data-reimb-approve="${safeText(r.id)}">Approve</button><button class="btn btn-secondary btn-sm" data-reimb-decline="${safeText(r.id)}">Decline</button></span>`
        : `<span class="sub-info">${safeText(r.resolutionNote || r.reference || "")}${r.resolvedAt ? `<br>${safeText(svDate(r.resolvedAt.slice(0, 10)))}` : ""}</span>`;
      return `
        <tr>
          <td><strong>${safeText(r.id)}</strong><span class="sub-info">${safeText(svDate(String(r.requestedAt || "").slice(0, 10)))}</span></td>
          <td>${safeText(r.customer)}<span class="sub-info"><button type="button" class="link-btn" style="margin:0;" data-view-app="${safeText(r.appId)}">${safeText(r.appId)}</button></span></td>
          <td>${safeText(r.type)}</td>
          <td class="num">${peso(r.amount)}</td>
          <td style="max-width:260px;"><span style="font-size:12.5px;">${safeText(r.reason)}</span>${r.attachment && r.attachment.dataUrl ? `<div><button type="button" class="link-btn" style="margin:0;" data-reimb-file="${safeText(r.id)}">View attachment</button></div>` : ""}${r.payoutDetails ? `<span class="sub-info">Pay to: ${safeText(r.payoutDetails)}</span>` : ""}</td>
          <td><span class="status-pill ${cls[r.status] || "neutral"}">${safeText(r.status)}</span></td>
          <td style="text-align:right;">${action}</td>
        </tr>`;
    }).join("");
  }

  // Refund / reimbursement modal
  let accModal = null; // { mode: "refund" | "approve" | "decline", kind, id }
  function openAccRefundModal(mode, kind, id) {
    accModal = { mode, kind, id };
    let ref, client, type, amount, policy = "";
    if (mode === "refund") {
      const row = db.getClientPayments().find(r => r.kind === kind && r.id === id);
      if (!row) return;
      ({ ref, client, type, amount } = row);
      policy = "The client proceeded with the installation, so this payment is refundable.";
    } else {
      const r = db.getReimbursements().find(x => x.id === id);
      if (!r) return;
      ref = `${r.id} · ${r.appId}`; client = r.customer; type = r.type; amount = r.amount;
      if (r.type === "Down Payment") {
        const app = db.data.applications.find(a => a.id === r.appId);
        const decision = app ? db.clientDecisionFor("dp", app) : "Awaiting";
        policy = decision === "Not Proceeding" ? "Policy: the client is not proceeding with the installation, so the down payment is non-refundable."
          : decision === "Proceeding" ? "Policy: the client proceeded with the installation, so the down payment is refundable." : "Policy: refundable only if the client proceeds with the installation.";
      }
    }
    $("#arfRef").textContent = ref;
    $("#arfClient").textContent = client;
    $("#arfType").textContent = type;
    $("#arfAmount").textContent = peso(amount);
    $("#arfPolicy").textContent = policy;
    $("#arfPolicy").style.display = policy ? "block" : "none";
    $("#arfEyebrow").textContent = mode === "refund" ? "ACCOUNTING · REFUND" : "ACCOUNTING · REIMBURSEMENT";
    $("#arfTitle").textContent = mode === "refund" ? "Refund Payment" : (mode === "approve" ? "Approve Reimbursement" : "Decline Reimbursement");
    $("#arfPayFields").style.display = mode === "decline" ? "none" : "block";
    $("#arfNoteLabel").textContent = mode === "decline" ? "Reason for declining" : "Notes (optional)";
    $("#btnConfirmAccRefund").textContent = mode === "refund" ? "Confirm Refund" : (mode === "approve" ? "Approve & Record Payout" : "Decline Request");
    $("#arfReference").value = "";
    $("#arfNote").value = "";
    $("#arfError").style.display = "none";
    $("#accRefundModal").classList.add("open");
  }

  function confirmAccRefund() {
    if (!accModal) return;
    const adminUser = SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)";
    const payload = { method: $("#arfMethod").value, reference: $("#arfReference").value, notes: $("#arfNote").value, note: $("#arfNote").value };
    const res = accModal.mode === "refund"
      ? db.refundClientPayment(accModal.kind, accModal.id, payload, { adminUser })
      : db.resolveReimbursement(accModal.id, accModal.mode === "approve" ? "Approved" : "Declined", payload, { adminUser });
    if (!res.success) {
      $("#arfError").textContent = res.error;
      $("#arfError").style.display = "block";
      return;
    }
    $("#accRefundModal").classList.remove("open");
    showToast(accModal.mode === "refund" ? "Refund recorded." : `Reimbursement ${accModal.mode === "approve" ? "approved" : "declined"}.`, "success", "✓");
    renderCurrentPage();
  }

  function wireSiteVisitAndAccountingEvents() {
    $("#btnSavePartnerTerms")?.addEventListener("click", e => {
      const id = e.currentTarget.dataset.inquiryId;
      const res = db.setPartnerProposal(id, {
        contractTermMonths: $("#inqPartnerTermInput").value,
        annualRate: $("#inqPartnerRateInput").value,
        contractStartDate: $("#inqPartnerStartInput").value
      }, SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)");
      if (!res.success) {
        const msg = $("#inqPartnerTermsMsg");
        msg.textContent = res.error;
        msg.style.color = "var(--danger)";
        return;
      }
      showToast(`Contract terms saved for ${safeText(id)}.`, "success", "✓");
      renderPartnerInquiryPanel(res.inquiry);
    });
    $("#inqPartnerTypeSelect")?.addEventListener("change", e => {
      const id = e.target.dataset.inquiryId;
      const res = db.setPartnerInquiryType(id, e.target.value, SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)");
      if (!res.success) { showToast(res.error, "danger", "⚠"); return; }
      if (e.target.value) showToast(`${id} set as ${e.target.value} partner.`, "success", "✓");
      renderPartnerInquiryPanel(res.inquiry);
      renderInquiries();
    });
    $$("#siteVisitFilterTabs .chip-btn").forEach(btn => btn.addEventListener("click", () => {
      state.siteVisitFilter = btn.dataset.status;
      renderSiteVisits();
    }));
    $("#siteVisitSearch")?.addEventListener("input", renderSiteVisits);
    $("#accClientSearch")?.addEventListener("input", renderClientPayments);
    $("#svaAssignee")?.addEventListener("change", e => { $("#svaOtherFields").style.display = e.target.value === "other" ? "block" : "none"; });
    $("#btnConfirmSiteVisitAssign")?.addEventListener("click", confirmSiteVisitAssign);
    $("#btnConfirmAccRefund")?.addEventListener("click", confirmAccRefund);
    $("#svaOtherPhone")?.addEventListener("input", e => { e.target.value = e.target.value.replace(/[^\d ]/g, ""); });

    document.addEventListener("change", e => {
      const sel = e.target.closest("[data-sv-select]");
      if (sel && sel.value) openSiteVisitAssignModal(sel.dataset.svSelect, sel.value);
    });
    document.addEventListener("click", e => {
      const linkBtn = e.target.closest("[data-sv-copylink],[data-sv-sendlink]");
      if (linkBtn) {
        const id = linkBtn.dataset.svCopylink || linkBtn.dataset.svSendlink;
        let v = db.getSiteVisits().find(x => x.id === id);
        if (linkBtn.dataset.svSendlink) {
          const res = db.sendSiteVisitContinueLink(id, { adminUser: SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)" });
          if (!res.success) { showToast(res.error, "danger", "⚠"); return; }
          v = res.visit;
          showToast(`Continue link sent to ${safeText(v.customer)}.`, "success", "✓");
          renderCurrentPage();
        }
        if (v && v.continueLink && linkBtn.dataset.svCopylink) {
          const url = new URL(`../${v.continueLink}`, window.location.href).href;
          (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
            () => showToast("Continue link copied.", "success", "✓"),
            () => showToast(url, "info", "🔗"));
        }
        return;
      }
      const t = e.target.closest("[data-sv-receipt],[data-sv-verify],[data-sv-assign],[data-sv-complete],[data-sv-cancel],[data-sv-doc],[data-acc-verify],[data-acc-decision],[data-acc-refund],[data-acc-receipt],[data-reimb-approve],[data-reimb-decline],[data-reimb-file]");
      if (!t) return;
      const adminUser = SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)";
      const visit = id => db.getSiteVisits().find(v => v.id === id);
      const done = (res, msg) => {
        if (!res.success) { showToast(res.error, "danger", "⚠"); return; }
        showToast(msg, "success", "✓");
        renderCurrentPage();
      };
      const d = t.dataset;
      if (d.svReceipt) { const fp = visit(d.svReceipt)?.feeProof; openStoredFile(fp?.dataUrl, { fileName: fp?.fileName, title: `Site visit fee · ${d.svReceipt}` }); }
      else if (d.svDoc) { const doc = visit(d.svDoc)?.assignee?.document; openStoredFile(doc?.dataUrl, { fileName: doc?.fileName, eyebrow: "DOCUMENT" }); }
      else if (d.svVerify && !IS_ENGINEER) done(db.verifySiteVisitFee(d.svVerify, { adminUser }), `Site visit fee verified for ${d.svVerify}.`);
      else if (d.svAssign && !IS_ENGINEER) openSiteVisitAssignModal(d.svAssign);
      else if (d.svComplete) {
        const opts = IS_ENGINEER ? { role: "Installer", user: ENGINEER.name, actorId: ENGINEER.actorId } : { user: adminUser };
        if (IS_ENGINEER) {
          const v = visit(d.svComplete);
          if (!v || !v.assignee || v.assignee.refId !== ENGINEER.actorId) return;
        }
        done(db.updateSiteVisitStatus(d.svComplete, "Completed", opts), `${d.svComplete} visit confirmed · continue link sent to the client.`);
      } else if (d.svCancel && !IS_ENGINEER) done(db.updateSiteVisitStatus(d.svCancel, "Cancelled", { user: adminUser }), `${d.svCancel} cancelled.`);
      else if (t.hasAttribute("data-acc-verify")) {
        const res = d.kind === "dp" ? db.verifyDownPayment(d.id, { adminUser }) : db.verifySiteVisitFee(d.id, { adminUser });
        done(res, `Payment verified for ${d.id}.`);
      } else if (d.accDecision) done(db.setClientDecision(d.kind, d.id, d.accDecision, { adminUser }), `${d.id} marked as ${d.accDecision}.`);
      else if (t.hasAttribute("data-acc-refund")) openAccRefundModal("refund", d.kind, d.id);
      else if (t.hasAttribute("data-acc-receipt")) {
        const row = db.getClientPayments().find(r => r.kind === d.kind && r.id === d.id);
        openStoredFile(row && row.proof && row.proof.dataUrl, { fileName: row && row.proof && row.proof.fileName, title: row ? `${row.type} · ${row.ref || row.id}` : "" });
      } else if (d.reimbApprove) openAccRefundModal("approve", null, d.reimbApprove);
      else if (d.reimbDecline) openAccRefundModal("decline", null, d.reimbDecline);
      else if (d.reimbFile) { const att = db.getReimbursements().find(r => r.id === d.reimbFile)?.attachment; openStoredFile(att?.dataUrl, { fileName: att?.fileName, eyebrow: "ATTACHMENT" }); }
    });
  }

  function renderAccounting() {
    if (IS_ENGINEER) return;
    if (typeof db.syncFinancerContracts === "function") db.syncFinancerContracts();
    const s = db.getAccountingSummary();
    const set = (id, v) => { if ($(id)) $(id).textContent = v; };
    const periodLabel = s.period ? new Date(`${s.period}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—";

    set("#accTotalPortfolio", peso(s.totalPortfolio));
    set("#accPeriod", periodLabel);
    set("#accExpectedRevenue", peso(s.expectedRevenue));
    set("#accCollectedRevenue", peso(s.collectedRevenue));
    set("#accCollectedPeriod", peso(s.collectedThisPeriod));
    set("#accHsRevenue", peso(s.hsRevenue));
    set("#accThirdPartyRevenue", peso(s.thirdPartyRevenue));
    const hsShare = s.expectedRevenue > 0 ? Math.round((s.hsRevenue / s.expectedRevenue) * 100) : 0;
    if ($("#accHsBar")) $("#accHsBar").style.width = `${hsShare}%`;
    set("#accSplitLabel", s.expectedRevenue > 0 ? `HS ${hsShare}% · Financer ${100 - hsShare}% of ${periodLabel} expected revenue` : "No revenue expected this period");
    set("#accOverdueAmount", peso(s.overdueAmount));
    set("#accOverdueAccounts", `${s.overdueAccounts} account${s.overdueAccounts === 1 ? "" : "s"}`);
    set("#accContractsActive", s.contracts.active);
    set("#accContractsExpired", s.contracts.expired);
    set("#accContractsOther", `${s.contracts.terminated} / ${s.contracts.pendingStart}`);

    renderAccountingTabs();
    renderRevenueChannels();
    renderMoneyOverview();
    renderPaymentsLedger();
    renderFunderSchedule();
    renderCustomerSchedule();
    renderFunderLoans();
    renderClientPayments();
    renderReimbursements();
    renderInstallationCostTable();
    renderSystemConnectionTable();
  }

  // ---- Accounting tabs: Overview · Receivables · Payables · System Control ----
  // Each Receivables / Payables sub-tab shows one existing panel (data-acc-panel)
  const ACC_SUBS = {
    in: [["received", "Payments Received", "payments"], ["monthly", "Monthly Payments", "customers"], ["loans", "From Funders", "loans"]],
    out: [["funders", "Funders", "funders"], ["refunds", "Refunds", "refunds"], ["costs", "Installation Costs", "operations"]]
  };
  // Older tab names still open the right place
  const ACC_LEGACY_TAB = { payments: ["in", "received"], customers: ["in", "monthly"], funders: ["out", "funders"], refunds: ["out", "refunds"], operations: ["out", "costs"] };

  function renderAccountingTabs() {
    if (ACC_LEGACY_TAB[state.accTab]) {
      const [tab, sub] = ACC_LEGACY_TAB[state.accTab];
      state.accTab = tab;
      state.accSub[tab] = sub;
    }
    const tab = ["overview", "in", "out", "system"].includes(state.accTab) ? state.accTab : "overview";
    $$("#accTabs .acc-tab").forEach(b => {
      const on = b.dataset.accTab === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    const subs = ACC_SUBS[tab];
    const seg = $("#accSubTabs");
    let panel = tab;
    if (subs) {
      const current = subs.find(s => s[0] === state.accSub[tab]) || subs[0];
      state.accSub[tab] = current[0];
      panel = current[2];
      if (seg) {
        seg.hidden = false;
        seg.innerHTML = subs.map(([id, label]) => `<button type="button" class="${id === current[0] ? "active" : ""}" data-acc-sub="${id}" role="tab" aria-selected="${id === current[0]}">${label}</button>`).join("");
      }
    } else if (seg) {
      seg.hidden = true;
      seg.innerHTML = "";
    }
    $$("#page-accounting .acc-panel").forEach(p => p.classList.toggle("active", p.dataset.accPanel === panel));
  }

  // ---- Month picker (Overview + Payables › Funders) ----
  function accThisMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function accMonth() {
    if (!/^\d{4}-\d{2}$/.test(state.accMonth || "")) state.accMonth = accThisMonth();
    return state.accMonth;
  }
  function accMonthLabel(m, style = "long") {
    return new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: style, year: "numeric" });
  }
  function accShiftMonth(m, step) {
    const [y, mo] = m.split("-").map(Number);
    const d = new Date(y, mo - 1 + step, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function renderAccMonthNav() {
    const m = accMonth();
    const atLatest = m >= accThisMonth();
    const html = `<div class="acc-month-nav" role="group" aria-label="Month">
        <button type="button" data-acc-month="-1" aria-label="Previous month">‹</button>
        <span>${accMonthLabel(m)}</span>
        <button type="button" data-acc-month="1" aria-label="Next month" ${atLatest ? "disabled" : ""}>›</button>
      </div>`;
    $$("#page-accounting .acc-month-slot").forEach(el => { el.innerHTML = html; });
  }

  // ---- Overview: Receivables, Payables and To Check for the picked month ----
  function renderMoneyOverview() {
    renderAccMonthNav();
    if (!db.getMoneySummary || !$("#accInTotal")) return;
    const s = db.getMoneySummary(accMonth());
    const set = (id, v) => { if ($(id)) $(id).textContent = v; };
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    set("#accInTotal", pesoExact(s.moneyIn.total));
    set("#accInHint", s.moneyIn.total
      ? [s.moneyIn.customerCount ? `${pesoExact(s.moneyIn.customers)} from ${plural(s.moneyIn.customerCount, "customer payment")}` : "",
        s.moneyIn.funderCount ? `${pesoExact(s.moneyIn.funders)} from funders` : ""].filter(Boolean).join(" · ")
      : "No verified payments this month");
    set("#accOutTotal", pesoExact(s.moneyOut.total));
    const outParts = [
      s.moneyOut.funders ? `Funders ${pesoExact(s.moneyOut.funders)}` : "",
      s.moneyOut.refunds ? `Refunds ${pesoExact(s.moneyOut.refunds)}` : "",
      s.moneyOut.costs ? `Installation ${pesoExact(s.moneyOut.costs)}` : ""
    ].filter(Boolean);
    set("#accOutHint", outParts.length ? outParts.join(" · ") : "Nothing paid out yet this month");
    set("#accOutStill", s.stillToPay.count ? `Still to pay: ${pesoExact(s.stillToPay.amount)} to ${plural(s.stillToPay.count, "funder")}` : "All funders are paid for this month");
    if ($("#accOutStill")) $("#accOutStill").classList.toggle("is-done", !s.stillToPay.count);
    set("#accCheckCount", String(s.toCheck.count));
    set("#accCheckHint", s.toCheck.count ? `${pesoExact(s.toCheck.amount)} waiting for verification` : "Nothing to check");

    const list = $("#accCheckList");
    if (!list) return;
    if (!s.toCheck.rows.length) {
      list.innerHTML = `<p class="acc-check-empty">All payments are checked. 🎉</p>`;
      return;
    }
    const PAY_FOR = { "Monthly Installment": "Monthly Payment" };
    list.innerHTML = s.toCheck.rows.slice(0, 6).map(r => `<div class="acc-check-row">
        <div class="acc-check-who">
          <strong>${safeText(PAY_FOR[r.type] || r.type)} — ${safeText(r.client || "—")}</strong>
          <span>${safeText([r.ref, r.reference, shortDate(r.date)].filter(x => x && x !== "—").join(" · "))}</span>
        </div>
        <strong class="acc-check-amt">${pesoExact(r.amount)}</strong>
        ${r.hasReceipt ? `<button type="button" class="btn btn-secondary btn-sm" data-ledger-receipt="${safeText(r.key)}">View</button>` : ""}
        <button type="button" class="btn btn-primary btn-sm" data-ledger-verify="${safeText(r.key)}">Verify</button>
      </div>`).join("") + (s.toCheck.rows.length > 6
      ? `<button type="button" class="link-btn acc-check-more" data-acc-go="in:received:check">See all ${s.toCheck.rows.length} payments to check →</button>` : "");
  }

  // ---- Receivables › From Funders ----
  function renderFunderLoans() {
    const body = $("#accLoansBody");
    if (!body || !db.getFunderLoansReceived) return;
    const rows = db.getFunderLoansReceived();
    const received = rows.filter(r => r.received);
    if ($("#accLoansTotal")) $("#accLoansTotal").textContent = pesoExact(received.reduce((s, r) => s + r.amount, 0));
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:22px; color:var(--muted);">No loans from funders yet.</td></tr>`;
      return;
    }
    const cls = { Active: "success", Expired: "neutral", Terminated: "danger", "Pending Start": "warn" };
    body.innerHTML = rows.map(r => `<tr>
        <td><strong>${safeText(r.funderName)}</strong><span class="sub-info">${safeText(r.funderId)}</span></td>
        <td><span class="status-pill ${cls[r.contractStatus] || "neutral"}">${safeText(r.received ? r.contractStatus : "Not received yet")}</span></td>
        <td>${safeText(shortDate(r.date))}</td>
        <td class="num"><strong>${pesoExact(r.amount)}</strong></td>
      </tr>`).join("");
  }

  function toggleFunderPaid(funderId, undo) {
    const adminUser = SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)";
    const m = accMonth();
    const res = undo ? db.undoFunderPaid(funderId, m, { adminUser }) : db.markFunderPaid(funderId, m, { adminUser });
    if (!res || res.success === false) {
      showToast((res && res.error) || "Could not update this payment.", "danger", "⚠");
      return;
    }
    showToast(undo ? `Payment undone · ${accMonthLabel(m)}` : `${safeText(res.payment.funderName)} marked as paid · ${accMonthLabel(m)}`, "success", "✓");
    renderMoneyOverview();
    renderFunderSchedule();
  }

  // Plain names shown for the revenue channels (the stored channel names stay the same)
  const ACC_CHANNEL_LABEL = { "Solar Financing Review": "Installment Payments", "Solar Kit Revenue": "Full Payment Sales", "Solar Installation Revenue": "Site Visit Fees" };
  const ACC_CHANNEL_COLOR = { "Solar Financing Review": "#2563EB", "Solar Kit Revenue": "#F59E0B", "Solar Installation Revenue": "#16A34A" };
  const ACC_CHANNEL_DESC = {
    "Solar Financing Review": "Installment customers · ₱10,000 down payments and monthly installments",
    "Solar Kit Revenue": "Full Payment customers · ₱500 down payments and full payments",
    "Solar Installation Revenue": "₱1,000 site visit fees (site assessment)"
  };
  const shortDate = d => d ? svDate(String(d).slice(0, 10)) : "—";

  function renderRevenueChannels() {
    const wrap = $("#accChannels");
    if (!wrap || !db.getRevenueChannels) return;
    const { channels, total } = db.getRevenueChannels();
    if ($("#accChannelsTotal")) $("#accChannelsTotal").textContent = pesoExact(total);
    wrap.innerHTML = channels.map(c => {
      const share = total > 0 ? Math.round((c.total / total) * 100) : 0;
      const color = ACC_CHANNEL_COLOR[c.name] || "var(--orange)";
      const breakdown = Object.entries(c.byType).map(([t, v]) => `<div class="acc-channel-break"><span>${safeText(t)}</span><strong>${pesoExact(v)}</strong></div>`).join("");
      return `<div class="acc-channel">
          <div class="acc-channel-name"><span class="acc-channel-dot" style="background:${color}"></span>${safeText(c.name)}</div>
          <div class="acc-channel-total">${pesoExact(c.total)}</div>
          <div class="acc-channel-meta">${c.count} payment${c.count === 1 ? "" : "s"} verified · ${share}% of total</div>
          <div class="acc-channel-bar"><span style="width:${share}%; background:${color}"></span></div>
          ${breakdown || `<div class="acc-channel-meta">${safeText(ACC_CHANNEL_DESC[c.name] || "")}</div>`}
          ${c.pendingCount ? `<div class="acc-channel-meta" style="color:#C2410C;">${c.pendingCount} to verify · ${pesoExact(c.pending)}</div>` : ""}
        </div>`;
    }).join("");
  }

  // ---- Payments Received (all payments, verify) ----
  const LEDGER_STATUS_CLASS = { Verified: "success", "Pending Verification": "warn", "Not Submitted": "neutral" };
  function renderPaymentsLedger() {
    const body = $("#accLedgerBody");
    if (!body || !db.getAllPayments) return;
    const all = db.getAllPayments().filter(r => r.status !== "Not Submitted");
    const pending = all.filter(r => r.status === "Pending Verification");
    if ($("#accPendingCount")) { $("#accPendingCount").textContent = pending.length; $("#accPendingCount").style.display = pending.length ? "" : "none"; }
    if ($("#accLedgerPending")) $("#accLedgerPending").textContent = `${pending.length} · ${pesoExact(pending.reduce((x, r) => x + r.amount, 0))}`;
    if ($("#accLedgerVerified")) $("#accLedgerVerified").textContent = pesoExact(all.filter(r => r.status === "Verified").reduce((x, r) => x + r.amount, 0));
    $$("#accLedgerTabs .chip-btn").forEach(b => b.classList.toggle("active", b.dataset.ledgerStatus === state.accLedgerStatus));
    const channel = $("#accLedgerChannel")?.value || "All";
    const q = ($("#accLedgerSearch")?.value || "").trim().toLowerCase();
    const rows = all.filter(r => (state.accLedgerStatus === "All" || r.status === state.accLedgerStatus) &&
      (channel === "All" || r.channel === channel) &&
      (!q || [r.ref, r.client, r.reference, r.type, r.period].some(x => String(x || "").toLowerCase().includes(q))));
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="sa-empty" style="text-align:center; padding:22px; color:var(--muted);">No payments match.</td></tr>`;
      return;
    }
    const PAY_FOR = { "Monthly Installment": "Monthly Payment" };
    const STATUS_LABEL = { "Pending Verification": "To Check", Verified: "Verified" };
    body.innerHTML = rows.map(r => {
      const refHtml = r.appId
        ? `<button type="button" class="link-btn" style="margin:0;" data-view-app="${safeText(r.appId)}">${safeText(r.ref)}</button>`
        : safeText(r.ref);
      const receipt = r.hasReceipt ? `<button type="button" class="btn btn-secondary btn-sm" data-ledger-receipt="${safeText(r.key)}">View</button>` : "";
      const action = r.canVerify
        ? `${receipt} <button class="btn btn-primary btn-sm" data-ledger-verify="${safeText(r.key)}">Verify</button>`
        : (receipt || `<span class="sub-info" style="margin:0;">Received</span>`);
      return `<tr>
          <td><strong>${safeText(r.client || "—")}</strong><span class="sub-info">${refHtml}${r.reference ? ` · ${safeText(r.reference)}` : ""}</span></td>
          <td>${safeText(PAY_FOR[r.type] || r.type)}${r.period ? `<span class="sub-info">${safeText(r.period)}</span>` : ""}<span class="sub-info">${safeText(ACC_CHANNEL_LABEL[r.channel] || r.channel)}</span></td>
          <td class="num"><strong>${pesoExact(r.amount)}</strong></td>
          <td>${safeText(shortDate(r.date))}</td>
          <td><span class="status-pill ${LEDGER_STATUS_CLASS[r.status] || "neutral"}">${safeText(STATUS_LABEL[r.status] || r.status)}</span></td>
          <td style="text-align:right; white-space:nowrap;">${action}</td>
        </tr>`;
    }).join("");
  }

  function verifyLedgerRow(key) {
    const adminUser = SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)";
    const res = db.verifyPaymentRow(key, { adminUser });
    if (!res || res.success === false) {
      showToast((res && (res.error || res.message)) || "Could not verify this payment.", "danger", "⚠");
      return;
    }
    showToast(`Payment verified · ${safeText(key.split(":")[1])}`, "success", "✓");
    renderCurrentPage();
  }

  function openLedgerReceipt(key) {
    const [kind, id] = key.split(":");
    if (kind === "dp") {
      const app = db.data.applications.find(a => a.id === id);
      return openStoredFile(app && app.downPaymentProof && app.downPaymentProof.dataUrl, { fileName: app && app.downPaymentProof && app.downPaymentProof.fileName, title: `Down payment · ${id}` });
    }
    if (kind === "sv") {
      const v = db.getSiteVisits().find(x => x.id === id);
      return openStoredFile(v && v.feeProof && v.feeProof.dataUrl, { fileName: v && v.feeProof && v.feeProof.fileName, title: `Site visit fee · ${id}` });
    }
    if (kind === "full") return openReviewReceiptModal(id);
  }

  // ---- Payment Schedule for Funders ----
  function renderFunderSchedule() {
    const body = $("#accFunderBody");
    if (!body || !db.getFunderSchedule) return;
    if (!db.getFunderPaymentsDue) return;
    renderAccMonthNav();
    const m = accMonth();
    const due = db.getFunderPaymentsDue(m);
    const rows = due.rows;
    if ($("#accFunderMonthHead")) $("#accFunderMonthHead").textContent = accMonthLabel(m, "short");
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:22px; color:var(--muted);">No funders with a loan yet.</td></tr>`;
      if ($("#accFunderFoot")) $("#accFunderFoot").innerHTML = "";
      return;
    }
    const contractCls = { Active: "success", Expired: "neutral", Terminated: "danger", "Pending Start": "warn", "No Contract": "neutral" };
    // Active funders first, then the ones not paid this month (expired / not started)
    const sorted = rows.slice().sort((a, b) => (b.due - a.due));
    body.innerHTML = sorted.map(r => {
      let monthCell;
      if (r.payment) {
        monthCell = `<span class="status-pill success">✓ Paid</span><span class="sub-info">${safeText(shortDate(r.payment.paidAt))} · <button type="button" class="link-btn" style="margin:0;" data-funder-undo="${safeText(r.funderId)}">Undo</button></span>`;
      } else if (r.due) {
        monthCell = `<button type="button" class="btn btn-primary btn-sm" data-funder-paid="${safeText(r.funderId)}">Mark as Paid</button>`;
      } else {
        monthCell = `<span class="sub-info" style="margin:0;">Not counted</span>`;
      }
      return `<tr class="${r.due ? "" : "acc-row-muted"}">
        <td><strong>${safeText(r.funderName)}</strong><span class="sub-info">${safeText(r.funderId)} · <span class="status-pill ${contractCls[r.contractStatus] || "neutral"}" style="font-size:10px; padding:1px 7px;">${safeText(r.contractStatus)}</span></span></td>
        <td class="num">${pesoExact(r.fund)}</td>
        <td class="num">${r.annualRate != null ? `${Number(r.annualRate).toFixed(2)}%` : "—"}</td>
        <td>${r.contractStatus === "Expired" ? `Ended ${safeText(shortDate(r.endDate))}` : safeText(shortDate(r.endDate))}${r.termMonths ? `<span class="sub-info">${r.termMonths} months · from ${safeText(shortDate(r.startDate))}</span>` : ""}</td>
        <td class="num"><strong>${r.termMonths ? pesoExact(r.totalMonthly) : "—"}</strong>${r.termMonths ? `<span class="sub-info">${pesoExact(r.monthlyInterest)} interest + ${pesoExact(r.monthlyPrincipal)} loan</span>` : ""}</td>
        <td style="text-align:right; white-space:nowrap;">${monthCell}</td>
      </tr>`;
    }).join("");
    const activeCount = rows.filter(r => r.due).length;
    if ($("#accFunderFoot")) $("#accFunderFoot").innerHTML = `<tr>
        <td colspan="4">We pay every month (${activeCount} active funder${activeCount === 1 ? "" : "s"})</td>
        <td class="num">${pesoExact(due.totalDue)}</td>
        <td style="text-align:right; white-space:normal;"><span class="sub-info" style="margin:0;">Paid ${pesoExact(due.paidTotal)}</span>${due.unpaidCount ? `<span class="sub-info" style="margin:0; color:#B91C1C;">Still to pay ${pesoExact(due.unpaidTotal)}</span>` : ""}</td>
      </tr>`;
  }

  // ---- Customers Payment Schedule (tabs per funder) ----
  function renderCustomerSchedule() {
    const body = $("#accCustSchedBody");
    if (!body || !db.getCustomerPaymentSchedule) return;
    const { rows, funders, totalMonthly } = db.getCustomerPaymentSchedule();
    if (state.accFunderFilter !== "All" && !funders.some(f => f.name === state.accFunderFilter)) state.accFunderFilter = "All";
    const tabs = $("#accFunderTabs");
    if (tabs) {
      tabs.innerHTML = [`<button class="acc-funder-tab ${state.accFunderFilter === "All" ? "active" : ""}" data-acc-funder="All">All Funders <small>${rows.length}</small></button>`]
        .concat(funders.map(f => `<button class="acc-funder-tab ${state.accFunderFilter === f.name ? "active" : ""}" data-acc-funder="${safeText(f.name)}">${safeText(f.name)} <small>${f.clients}</small></button>`)).join("");
    }
    const selected = funders.find(f => f.name === state.accFunderFilter);
    if ($("#accFunderTotalLabel")) $("#accFunderTotalLabel").textContent = selected
      ? `Total Monthly Fixed · ${selected.name} (${selected.clients} client${selected.clients === 1 ? "" : "s"})`
      : `Total Monthly Fixed · All Funders (${rows.length} client${rows.length === 1 ? "" : "s"})`;
    if ($("#accFunderTotalValue")) $("#accFunderTotalValue").textContent = pesoExact(selected ? selected.totalMonthly : totalMonthly);

    const q = ($("#accCustSchedSearch")?.value || "").trim().toLowerCase();
    const list = rows.filter(r => (state.accFunderFilter === "All" || r.funderName === state.accFunderFilter) &&
      (!q || [r.client, r.appId].some(x => String(x || "").toLowerCase().includes(q))));
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:22px; color:var(--muted);">No customers paying monthly${selected ? ` under ${safeText(selected.name)}` : ""}.</td></tr>`;
      if ($("#accCustSchedFoot")) $("#accCustSchedFoot").innerHTML = "";
      return;
    }
    body.innerHTML = list.map(r => `<tr>
        <td><strong>${safeText(r.client)}</strong><span class="sub-info"><button type="button" class="link-btn" style="margin:0;" data-view-app="${safeText(r.appId)}">${safeText(r.appId)}</button></span></td>
        <td>${safeText(r.funderName || "—")}${r.ownedByHelloSolar ? `<span class="sub-info">Now owned by Hello Solar · contract ended</span>` : ""}</td>
        <td class="num">${pesoExact(r.amount)}</td>
        <td class="num">${r.annualRate != null ? `${Number(r.annualRate).toFixed(2)}%` : "—"}</td>
        <td>${safeText(shortDate(r.endDate))}${r.termMonths ? `<span class="sub-info">${r.termMonths} months · from ${safeText(shortDate(r.startDate))}</span>` : ""}</td>
        <td class="num"><strong>${pesoExact(r.monthlyFixed)}</strong></td>
      </tr>`).join("");
    const sumAmt = list.reduce((x, r) => x + r.amount, 0);
    const sumMonthly = Math.round(list.reduce((x, r) => x + r.monthlyFixed, 0) * 100) / 100;
    if ($("#accCustSchedFoot")) $("#accCustSchedFoot").innerHTML = `<tr>
        <td colspan="2">We should collect every month (${list.length} customer${list.length === 1 ? "" : "s"})</td>
        <td class="num">${pesoExact(sumAmt)}</td><td></td><td></td>
        <td class="num">${pesoExact(sumMonthly)}</td>
      </tr>`;
  }

  // ---- Installation Cost (Hello Solar Direct projects only, per APP ID) ----
  const pesoExact = num => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(num) || 0);

  function renderInstallationCostTable() {
    const tbody = $("#accInstCostTableBody");
    if (!tbody || typeof db.getDirectInstallationCosts !== "function") return;
    const rows = db.getDirectInstallationCosts();
    const grand = rows.reduce((sum, r) => sum + r.total, 0);
    if ($("#accInstCostProjects")) $("#accInstCostProjects").textContent = `${rows.filter(r => r.isSet).length} / ${rows.length}`;
    if ($("#accInstCostTotal")) $("#accInstCostTotal").textContent = pesoExact(grand);

    const q = ($("#accInstCostSearch")?.value || "").toLowerCase().trim();
    const filtered = rows.filter(r => !q || [r.appId, r.hsId, r.customer, r.location].some(v => String(v || "").toLowerCase().includes(q)));
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="sa-empty">${rows.length ? "No Hello Solar Installation projects match your search." : "No Hello Solar Installation projects yet."}</td></tr>`;
      return;
    }
    const cell = (v, isSet) => isSet ? pesoExact(v) : `<span class="sa-dim">—</span>`;
    tbody.innerHTML = filtered.map(r => `
      <tr>
        <td><span class="record-id">${safeText(r.appId)}</span><span class="sub-info">${r.hsId ? safeText(r.hsId) : "HS ID not assigned"}</span></td>
        <td><strong>${safeText(r.customer)}</strong><span class="sub-info">${safeText([r.system, r.location].filter(Boolean).join(" · "))}</span></td>
        <td class="num">${cell(r.materials, r.isSet)}</td>
        <td class="num">${cell(r.labor, r.isSet)}</td>
        <td class="num">${cell(r.transportMisc, r.isSet)}</td>
        <td class="num"><strong>${r.isSet ? pesoExact(r.total) : `<span class="sa-dim">Not set</span>`}</strong></td>
        <td style="text-align:right;"><button class="btn ${r.isSet ? "btn-secondary" : "btn-primary"} btn-sm" data-edit-install-cost="${safeText(r.appId)}">${r.isSet ? "Edit" : "Add Cost"}</button></td>
      </tr>
    `).join("");
  }

  function updateInstallationCostTotal() {
    const v = id => { const n = Number($(id)?.value); return Number.isFinite(n) && n > 0 ? n : 0; };
    const total = v("#icMaterialsInput") + v("#icLaborInput") + v("#icTransportInput");
    if ($("#icTotalText")) $("#icTotalText").textContent = pesoExact(total);
  }

  function openInstallationCostModal(appId) {
    if (IS_ENGINEER) return;
    const row = (db.getDirectInstallationCosts ? db.getDirectInstallationCosts() : []).find(r => r.appId === appId);
    if (!row) {
      showToast(`${safeText(appId)} is not a Hello Solar Installation project.`, "danger", "⚠");
      return;
    }
    $("#icAppId").value = row.appId;
    $("#icTitle").textContent = `${row.appId} · ${row.customer}`;
    $("#icSubtitle").textContent = [row.hsId || "HS ID not assigned", row.system, row.location].filter(Boolean).join(" · ") +
      (row.updatedAt ? ` · Updated ${calculateRelativeTime(row.updatedAt) || formatReadableDate(row.updatedAt)}` : "");
    $("#icMaterialsInput").value = row.isSet ? row.materials : "";
    $("#icLaborInput").value = row.isSet ? row.labor : "";
    $("#icTransportInput").value = row.isSet ? row.transportMisc : "";
    $("#icError").style.display = "none";
    updateInstallationCostTotal();
    $("#installationCostModal")?.classList.add("open");
    setTimeout(() => $("#icMaterialsInput")?.focus(), 50);
  }

  function saveInstallationCost() {
    const appId = $("#icAppId").value;
    const res = db.setInstallationCost(appId, {
      materials: $("#icMaterialsInput").value,
      labor: $("#icLaborInput").value,
      transportMisc: $("#icTransportInput").value
    }, { actorRole: SESSION.role, adminUser: SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)" });
    if (!res.success) {
      $("#icError").textContent = res.error;
      $("#icError").style.display = "block";
      return;
    }
    $("#installationCostModal")?.classList.remove("open");
    showToast(`Installation cost saved for ${safeText(appId)} · ${pesoExact(res.cost.total)}`, "success", "✓");
    renderInstallationCostTable();
  }

  function connectionPill(status) {
    const cls = status === "Disconnected" ? "danger" : status === "Disconnect Requested" ? "warn" : "success";
    return `<span class="status-pill ${cls}">${safeText(status)}</span>`;
  }

  function renderSystemConnectionTable() {
    const tbody = $("#accSystemsTableBody");
    if (!tbody) return;
    const q = ($("#accSystemSearch")?.value || "").toLowerCase().trim();
    const apps = (db.getApplications ? db.getApplications() : db.data.applications).filter(app => {
      if (!q) return true;
      return [app.id, db.getAppHsId(app) || "Not assigned", app.customer, db.getSystemConnectionStatus(app)].some(v => String(v || "").toLowerCase().includes(q));
    });
    if (!apps.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--muted);">No systems match your search.</td></tr>`;
      return;
    }
    tbody.innerHTML = apps.map(app => {
      const status = db.getSystemConnectionStatus(app);
      const req = app.disconnectRequest;
      const sub = req
        ? `<span class="sub-info">${status === "Disconnected" ? `Confirmed ${safeText(db.formatExactAuditTimestamp(req.confirmedAt))} · ref ${safeText(req.apiReference)}` : `Requested ${safeText(db.formatExactAuditTimestamp(req.requestedAt))} by ${safeText(req.requestedBy)}`}</span>`
        : "";
      const hsId = db.getAppHsId(app);
      let action;
      if (status !== "Connected") {
        action = `<span style="font-size:12px; color:var(--muted);">${status === "Disconnect Requested" ? "Awaiting backend confirmation" : "Disconnected"}</span>`;
      } else if (!hsId) {
        action = `<button class="btn btn-sm" disabled title="A valid HS ID is required before a system can be disconnected." style="background:#f5f5f5; color:#a3a3a3; border:1px solid #e5e5e5; cursor:not-allowed;">Immediate Disconnect</button>
          <span class="sub-info" style="margin-top:4px;">Valid HS ID required</span>`;
      } else {
        action = `<button class="btn btn-sm" data-request-disconnect="${safeText(app.id)}" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;">Immediate Disconnect</button>`;
      }
      return `
        <tr>
          <td><span class="record-id">${safeText(app.id)}</span></td>
          <td>${hsId ? `<strong>${safeText(hsId)}</strong>` : `<span style="color:var(--muted);">Not assigned</span>`}</td>
          <td><strong>${safeText(app.customer)}</strong><span class="sub-info">${safeText(app.location || "")}</span></td>
          <td><span class="status-pill ${getStatusClass(app.paymentStatus)}">${safeText(app.paymentStatus || "—")}</span></td>
          <td>${connectionPill(status)}${sub}</td>
          <td style="text-align:right;">${action}</td>
        </tr>
      `;
    }).join("");
  }

  function openSystemDisconnectModal(appId) {
    if (IS_ENGINEER) return;
    const app = db.data.applications.find(a => a.id === appId);
    if (!app) return;
    const hsId = db.getAppHsId(app);
    if (!hsId) {
      showToast(`${safeText(app.id)} has no HS ID assigned. A valid HS ID is required before a system disconnect can be requested.`, "danger", "⚠");
      return;
    }
    $("#sdAppId").value = app.id;
    $("#sdAppIdText").textContent = app.id;
    $("#sdHsIdText").textContent = hsId;
    $("#sdCustomerText").textContent = app.customer || "—";
    $("#sdStatusText").textContent = db.getSystemConnectionStatus(app);
    $("#sdConfirmIds").textContent = `${app.id} / ${hsId}`;
    $("#sdReasonInput").value = "";
    $("#sdConfirmCheck").checked = false;
    $("#sdError").style.display = "none";
    $("#systemDisconnectModal")?.classList.add("open");
  }

  function submitSystemDisconnect() {
    const showError = msg => { $("#sdError").textContent = msg; $("#sdError").style.display = "block"; };
    if (!$("#sdConfirmCheck").checked) return showError("Please confirm the APP ID and HS ID before requesting a disconnect.");
    const appId = $("#sdAppId").value;
    const res = db.requestSystemDisconnect(appId, {
      reason: $("#sdReasonInput").value,
      actorRole: SESSION.role,
      adminUser: SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)"
    });
    if (!res.success) return showError(res.error);
    $("#systemDisconnectModal")?.classList.remove("open");
    showToast(`Disconnect requested for ${safeText(res.request.appId)} (${safeText(res.request.hsId)}). Awaiting backend confirmation.`, "danger", "⚠");
    renderCurrentPage();
  }

  // Financer / funding-owner block for financed (installment) payment rows; full payments render nothing.
  function renderPaymentFundingInfo(funding) {
    if (!funding || !funding.isFinanced) return "";
    const financer = funding.financerName ? safeText(funding.financerName) : "Financer pending";
    // Owner pill only when revenue ownership differs from the financer (e.g. reverted to Hello Solar)
    const owner = funding.ownerName && funding.ownerName !== funding.financerName
      ? `<span class="status-pill ${funding.ownerType === "Financer" ? "success" : "direct"} sa-pill-xs" title="Funding / revenue owner">Owner: ${safeText(funding.ownerName)}</span>`
      : "";
    const contract = funding.contractStatus
      ? `<span class="status-pill ${getStatusClass(funding.contractStatus)} sa-pill-xs" title="Contract status${funding.contractEndDate ? ` · ends ${formatReadableDate(funding.contractEndDate)}` : ""}">${safeText(funding.contractStatus)}</span>`
      : "";
    return `
      <span class="sub-info sa-funding-line">${financer}</span>
      ${owner || contract ? `<span class="sa-funding-pills">${owner}${contract}</span>` : ""}
    `;
  }

  // --- REVIEW FULL PAYMENT RECEIPT MODAL ---
  function openReviewReceiptModal(appId) {
    const apps = db.getApplications ? db.getApplications() : db.data.applications;
    const app = apps.find(a => a.id === appId);
    if (!app) return;

    state.selectedAppId = appId;

    if ($("#rrAppId")) $("#rrAppId").value = app.id;
    if ($("#rrAppIdText")) $("#rrAppIdText").textContent = app.id;
    if ($("#rrCustomer")) $("#rrCustomer").textContent = app.customer;
    if ($("#rrHsId")) $("#rrHsId").textContent = db.getAppHsId(app) || "Not assigned";
    if ($("#rrAmount")) $("#rrAmount").textContent = peso(app.amount);
    if ($("#rrUploadedDate")) {
      $("#rrUploadedDate").textContent = app.receiptUploadedAt ? formatReadableDate(app.receiptUploadedAt) : "Awaiting Customer Upload";
    }
    if ($("#rrPaymentMethod")) {
      $("#rrPaymentMethod").textContent = app.receiptBank || "Bank Transfer (Direct Full Payment)";
    }
    if ($("#rrStatusBadge")) {
      $("#rrStatusBadge").textContent = app.paymentStatus;
      $("#rrStatusBadge").className = `status-pill ${getStatusClass(app.paymentStatus)}`;
    }

    // Receipt details
    if ($("#rrReceiptBankName")) $("#rrReceiptBankName").textContent = app.receiptBank || "BDO Unibank Direct Transfer";
    if ($("#rrReceiptRefNumber")) $("#rrReceiptRefNumber").textContent = app.receiptReference || `TXN-REF-${app.id.replace('APP-', '')}-01`;
    if ($("#rrReceiptAmountPaid")) $("#rrReceiptAmountPaid").textContent = peso(app.receiptAmount || app.amount);
    if ($("#rrReceiptTimestamp")) $("#rrReceiptTimestamp").textContent = app.receiptUploadedAt ? formatReadableDate(app.receiptUploadedAt) : (app.updated || "Recent");

    const hasReceipt = Boolean(app.uploadedReceipt);
    if ($("#rrReceiptPreviewBox")) $("#rrReceiptPreviewBox").style.display = hasReceipt ? "block" : "none";
    if ($("#rrUploadSimulationBox")) $("#rrUploadSimulationBox").style.display = hasReceipt ? "none" : "block";
    if ($("#rrRejectReasonBox")) $("#rrRejectReasonBox").style.display = "none";

    const isVerified = app.paymentStatus === "Verified" || app.paymentStatus === "Completed" || app.paymentStatus === "Paid" || app.paymentStatus === "Verified / Paid";

    if ($("#btnVerifyPayment")) {
      if (isVerified) {
        $("#btnVerifyPayment").disabled = true;
        $("#btnVerifyPayment").textContent = "✓ Payment Verified";
      } else {
        $("#btnVerifyPayment").disabled = !hasReceipt;
        $("#btnVerifyPayment").textContent = "Verify Payment";
      }
    }

    if ($("#btnRejectPayment")) {
      $("#btnRejectPayment").disabled = isVerified;
    }

    $("#reviewReceiptModal")?.classList.add("open");
  }

  function reviewInstallmentReceipt(action) {
    if (IS_ENGINEER) return;
    const appId = state.selectedAppId;
    const submissionId = $("#pmReceiptReview")?.dataset.submissionId;
    if (!appId || !submissionId) return;
    let res;
    if (action === "verify") {
      res = db.verifyInstallmentReceipt(appId, submissionId, { adminUser: "ADMIN (Limuel)" });
    } else {
      const reason = ($("#pmReceiptRejectReason")?.value || "").trim();
      if (!reason) {
        showToast("Enter a reason before rejecting the receipt.", "warn", "⚠");
        $("#pmReceiptRejectReason")?.focus();
        return;
      }
      res = db.rejectInstallmentReceipt(appId, submissionId, { reason, adminUser: "ADMIN (Limuel)" });
    }
    if (!res.success) {
      showToast(res.error || "Receipt could not be updated.", "danger", "⚠");
      return;
    }
    window.HELLO_SOLAR_DATA = db.data;
    showToast(action === "verify"
      ? `Receipt verified for ${appId}. Installment #${res.installments.join(", #") || "—"} marked Paid.`
      : `Receipt rejected for ${appId}. Customer asked to re-upload.`, action === "verify" ? "success" : "danger", action === "verify" ? "✓" : "⚠");
    renderCurrentPage();
    openPaymentModal(appId);
  }

  function switchPaymentModalTab(tabKey) {
    state.paymentCurrentTab = tabKey;
    $$("#pmModalTabs .modal-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.pmtab === tabKey);
    });

    $$("#paymentModal .modal-tab-content").forEach(content => {
      content.classList.toggle("active", content.id === `pmTabContent${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
    });
  }

  function openPaymentModal(appId) {
    const app = db.data.applications.find(a => a.id === appId);
    if (!app) return;

    state.selectedAppId = appId;
    const schedule = db.getPaymentSchedule(appId);
    const statusInfo = db.calculatePaymentStatus(app);

    // Sync app object
    app.paymentStatus = statusInfo.status;
    app.nextDue = statusInfo.nextDue;

    if ($("#pmTitle")) $("#pmTitle").textContent = `Payment Details · ${app.id} (${app.customer})`;
    if ($("#pmStatusBadge")) {
      $("#pmStatusBadge").className = `status-pill ${getStatusClass(statusInfo.status)}`;
      $("#pmStatusBadge").textContent = statusInfo.status;
    }

    // 1. Summary Tab
    if ($("#pmAppId")) $("#pmAppId").value = app.id;
    if ($("#pmAppIdText")) $("#pmAppIdText").textContent = app.id;
    if ($("#pmCustomer")) $("#pmCustomer").textContent = app.customer;
    if ($("#pmAmount")) $("#pmAmount").textContent = peso(app.amount);
    // Funder = the original financer; when its contract has ended the account is now owned by Hello Solar
    if (typeof db.syncFinancerContracts === "function") db.syncFinancerContracts();
    const funding = typeof db.getApplicationFunding === "function" ? db.getApplicationFunding(app) : null;
    const isFullPay = (app.paymentType || "").toLowerCase().includes("full") || app.financer === "Not Required";
    if ($("#pmFinancer")) $("#pmFinancer").textContent = isFullPay ? "Hello Solar (Full Payment)" : (app.financer || "—");
    if ($("#pmFundingOwner")) {
      $("#pmFundingOwner").textContent = funding && funding.ownerName && funding.ownerName !== app.financer && !isFullPay
        ? `Now owned by ${funding.ownerName}`
        : "";
    }
    if ($("#pmContractStatus")) {
      $("#pmContractStatus").innerHTML = funding && funding.contractStatus
        ? `<span class="status-pill ${getStatusClass(funding.contractStatus)}">${safeText(funding.contractStatus)}</span>`
        : "—";
    }
    if ($("#pmContractEnd")) $("#pmContractEnd").textContent = funding && funding.contractEndDate ? formatReadableDate(funding.contractEndDate) : "—";
    if ($("#pmStatus")) {
      $("#pmStatus").className = `status-pill ${getStatusClass(statusInfo.status)}`;
      $("#pmStatus").textContent = statusInfo.status;
    }
    if ($("#pmNextDue")) {
      const nextUnpaid = (schedule?.installments || []).filter(i => i.status !== "Paid")
        .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
      $("#pmNextDue").textContent = statusInfo.status === "Completed" || !nextUnpaid
        ? "Paid in full"
        : `${statusInfo.status === "Overdue" ? "Missed due" : "Next due"}: ${formatReadableDate(statusInfo.nextDue)} · ${peso(nextUnpaid.amount || app.monthly)}`;
      $("#pmNextDue").classList.toggle("is-overdue", statusInfo.status === "Overdue");
    }
    if ($("#pmRemainingBalance")) $("#pmRemainingBalance").textContent = peso(statusInfo.remainingBalance);
    if ($("#pmTotalPaid")) $("#pmTotalPaid").textContent = peso(statusInfo.totalPaid);
    if ($("#pmProgressText")) {
      const pct = Math.round((statusInfo.progressCount / (statusInfo.totalInstallments || 1)) * 100);
      $("#pmProgressText").textContent = `${statusInfo.progressCount} of ${statusInfo.totalInstallments} installments completed (${pct}%)`;
    }

    // Status Alert Banner in Summary Tab
    const alertBox = $("#pmStatusAlert");
    if (alertBox) {
      if (statusInfo.status === "Overdue") {
        alertBox.style.display = "block";
        alertBox.style.background = "#fff1f2";
        alertBox.style.border = "1px solid #fecdd3";
        alertBox.style.color = "#9f1239";
        alertBox.innerHTML = `<strong>⚠ Delinquency Notice:</strong> Scheduled installment of <strong>${peso(app.monthly)}</strong> was missed on <strong>${formatReadableDate(statusInfo.nextDue)}</strong>. Requires administrative follow-up with customer and ${app.financer}.`;
      } else if (statusInfo.status === "Due Soon") {
        alertBox.style.display = "block";
        alertBox.style.background = "#fefce8";
        alertBox.style.border = "1px solid #fef08a";
        alertBox.style.color = "#854d0e";
        alertBox.innerHTML = `<strong>◷ Payment Due Soon:</strong> Installment of <strong>${peso(app.monthly)}</strong> is due on <strong>${formatReadableDate(statusInfo.nextDue)}</strong> (within the next 7 days). Auto-debit scheduled.`;
      } else if (statusInfo.status === "Completed") {
        alertBox.style.display = "block";
        alertBox.style.background = "#f0fdf4";
        alertBox.style.border = "1px solid #bbf7d0";
        alertBox.style.color = "#166534";
        alertBox.innerHTML = `<strong>✓ Obligation Completed:</strong> Financing obligation is fully satisfied. Account paid in full. Total capital amortized: <strong>${peso(app.amount)}</strong>.`;
      } else {
        alertBox.style.display = "none";
      }
    }

    // Customer installment receipt awaiting verification
    const pendingReceipt = db.getPendingInstallmentReceipt(app.id);
    const reviewBox = $("#pmReceiptReview");
    if (reviewBox) {
      reviewBox.style.display = pendingReceipt ? "block" : "none";
      if (pendingReceipt) {
        const periods = (pendingReceipt.bills || []).map(b => b.period || formatReadableDate(b.dueDate)).filter(Boolean).join(", ") || "Current installment";
        $("#pmReceiptReviewText").innerHTML = `<strong>Receipt Awaiting Verification:</strong> ${safeText(pendingReceipt.fileName || "Receipt")} · ${pendingReceipt.amount ? peso(pendingReceipt.amount) : "—"} via ${safeText(pendingReceipt.channel || "—")} · Ref ${safeText(pendingReceipt.reference || "—")}<br><span class="sub-info" style="margin-top:4px;">Billing period: <strong>${safeText(periods)}</strong> · Submitted ${formatReadableDate(pendingReceipt.date || pendingReceipt.submittedAt)}</span>`;
        if ($("#pmReceiptRejectReason")) $("#pmReceiptRejectReason").value = "";
        reviewBox.dataset.submissionId = pendingReceipt.id;
      }
    }

    // Record Payment button in action panel
    const btnRecord = $("#btnOpenRecordPaymentModal");
    if (btnRecord) {
      if (statusInfo.status === "Completed") {
        btnRecord.disabled = true;
        btnRecord.innerHTML = `<span>✓</span> Obligation Paid in Full`;
      } else {
        btnRecord.disabled = false;
        btnRecord.innerHTML = `<span>💳</span> Record Payment`;
      }
    }

    // 2. Payment Schedule Tab: each installment with the payment recorded against it (schedule + history in one)
    if (schedule && schedule.installments) {
      const history = schedule.history || [];
      if ($("#pmScheduleCount")) $("#pmScheduleCount").textContent = schedule.installments.length;
      if ($("#pmScheduleSummaryBadge")) $("#pmScheduleSummaryBadge").textContent = `${statusInfo.progressCount} of ${schedule.installments.length} paid · ${peso(app.monthly)} / mo`;

      const schedBody = $("#pmScheduleTableBody");
      if (schedBody) {
        schedBody.innerHTML = schedule.installments.map(i => {
          const rec = history.find(h => h.installmentNo === i.no) || history.find(h => i.reference && (h.ref === i.reference || h.id === i.reference));
          const paid = i.status === "Paid";
          return `
          <tr>
            <td><strong>#${i.no}</strong></td>
            <td><span style="font-weight:600; white-space:nowrap;">${formatReadableDate(i.dueDate)}</span></td>
            <td><strong>${peso(i.amount)}</strong></td>
            <td><span class="status-pill ${getStatusClass(i.status)}">${i.status}</span></td>
            <td>${i.paidDate ? `<span style="color:var(--success); font-weight:600; white-space:nowrap;">${formatReadableDate(i.paidDate)}</span>` : '—'}</td>
            <td>${paid ? peso(i.paidAmount || i.amount) : '—'}</td>
            <td style="white-space:nowrap;">${paid ? safeText((rec && rec.method) || 'Auto-Debit') : '—'}</td>
            <td>${paid || i.reference ? `<code style="font-size:11px; background:var(--bg); padding:2px 6px; border-radius:3px; white-space:nowrap;">${safeText((rec && rec.ref) || i.reference || '—')}</code>` : '—'}</td>
          </tr>`;
        }).join("");
      }
    }

    // 3. Activity Tab
    const activities = db.getPaymentActivity(app.id);
    if ($("#pmActivityCount")) $("#pmActivityCount").textContent = activities.length;
    const actTimeline = $("#pmActivityTimeline");
    if (actTimeline) {
      if (!activities.length) {
        actTimeline.innerHTML = `<div style="text-align:center; padding:24px; color:var(--muted);">No payment activity logged for this application yet.</div>`;
      } else {
        actTimeline.innerHTML = activities.map(act => `
          <div class="timeline-step">
            <div class="timeline-dot ${act.role === 'Admin' ? 'active' : ''}"></div>
            <div class="timeline-content">
              <div class="timeline-head">
                <span class="timeline-role role-${(act.role || 'Admin').toLowerCase()}">${act.role}</span>
                <span class="timeline-user">${act.user}</span>
                <span class="timeline-time">${calculateRelativeTime(act.timestamp || act.exactTime) || act.exactTime || act.time || "Recent"}</span>
              </div>
              <div class="timeline-action">${act.action}</div>
            </div>
          </div>
        `).join("");
      }
    }

    // Default to summary tab
    switchPaymentModalTab(state.paymentCurrentTab || "summary");

    $("#paymentModal")?.classList.add("open");
  }

  function openRecordPaymentConfirmModal() {
    const appId = state.selectedAppId;
    if (!appId) return;

    const app = db.data.applications.find(a => a.id === appId);
    if (!app) return;

    const schedule = db.getPaymentSchedule(appId);
    if (!schedule) return;

    const unpaid = schedule.installments.filter(i => i.status !== "Paid");
    unpaid.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const target = unpaid[0] || { no: 1, dueDate: "2026-09-24", amount: app.monthly };

    if ($("#rpcAppId")) $("#rpcAppId").value = app.id;
    if ($("#rpcAppText")) $("#rpcAppText").textContent = app.id;
    if ($("#rpcCustomerText")) $("#rpcCustomerText").textContent = app.customer;
    if ($("#rpcFinancerText")) $("#rpcFinancerText").textContent = app.financer;
    if ($("#rpcInstallmentText")) $("#rpcInstallmentText").textContent = `#${target.no} (Due: ${formatReadableDate(target.dueDate)})`;
    if ($("#rpcAmountInput")) $("#rpcAmountInput").value = target.amount || app.monthly;
    if ($("#rpcDateInput")) $("#rpcDateInput").value = "2026-09-24";
    if ($("#rpcRefInput")) $("#rpcRefInput").value = `HS-REC-${app.id.replace('APP-', '')}-${Date.now().toString().slice(-4)}`;
    if ($("#rpcNotesInput")) $("#rpcNotesInput").value = `Verified payment installment #${target.no} via Super Admin portal.`;

    $("#recordPaymentConfirmModal")?.classList.add("open");
  }

  function confirmRecordPaymentAction() {
    const appId = $("#rpcAppId") ? $("#rpcAppId").value : state.selectedAppId;
    if (!appId) return;

    const amount = Number($("#rpcAmountInput")?.value) || 0;
    const date = $("#rpcDateInput")?.value || "2026-09-24";
    const ref = $("#rpcRefInput")?.value.trim() || `HS-REC-${appId.replace('APP-', '')}-${Date.now().toString().slice(-4)}`;
    const method = $("#rpcMethodSelect")?.value || "Bank Transfer";
    const notes = $("#rpcNotesInput")?.value.trim() || "";

    if (amount <= 0) {
      alert("Please specify a valid payment amount.");
      return;
    }

    const res = db.recordPayment(appId, {
      amount,
      date,
      reference: ref,
      method,
      notes,
      adminUser: "ADMIN (Limuel)"
    });

    if (res && res.success) {
      $("#recordPaymentConfirmModal")?.classList.remove("open");
      showToast(`Payment of ${peso(amount)} recorded for ${appId}. Status: ${res.app.paymentStatus}`, "success", "💳");
      openPaymentModal(appId);
      renderPayments();
      if (typeof renderOverview === "function") renderOverview();
    }
  }

  function openPaymentAdjustModal() {
    const appId = state.selectedAppId;
    if (!appId) return;

    if ($("#pajAppId")) $("#pajAppId").value = appId;
    if ($("#pajNotesInput")) $("#pajNotesInput").value = "";
    $("#paymentAdjustModal")?.classList.add("open");
  }

  function confirmPaymentAdjustAction() {
    const appId = $("#pajAppId") ? $("#pajAppId").value : state.selectedAppId;
    if (!appId) return;

    const type = $("#pajTypeSelect")?.value || "Payment Note";
    const notes = $("#pajNotesInput")?.value.trim();

    if (!notes) {
      alert("Please provide context for the administrative adjustment note.");
      return;
    }

    db.recordPaymentAdjustment(appId, {
      type,
      notes,
      date: "2026-09-24",
      adminUser: "ADMIN (Limuel)"
    });

    $("#paymentAdjustModal")?.classList.remove("open");
    showToast(`Adjustment note logged for ${appId}`, "success", "✎");
    openPaymentModal(appId);
    renderPayments();
    if (typeof renderOverview === "function") renderOverview();
  }

  // ==================== 6. SUPPORT PAGE & RELATED RECORDS ====================
  // Support: clicking a related ID splits the screen. Support stays on the left, the record opens on the right;
  // closing the record brings the page back to normal.
  let supportSplitObserver = null;
  function openRelatedRecord(recordId) {
    const fromSupport = state.currentPage === "support";
    if (fromSupport) $$(".split-pane.open").forEach(el => el.classList.remove("open"));
    openRelatedRecordInner(recordId);
    if (fromSupport && state.currentPage === "support") {
      enterSupportSplit();
      // Highlight the ticket row whose ID was clicked
      $$("#supportTableBody tr.split-active").forEach(tr => tr.classList.remove("split-active"));
      if (document.body.classList.contains("support-split")) {
        const btn = $$("#supportTableBody [data-open-record]").find(b => b.dataset.openRecord === recordId);
        btn?.closest("tr")?.classList.add("split-active");
      }
    }
  }

  function enterSupportSplit() {
    const panes = $$(".modal-overlay.open, .drawer-overlay.open").filter(el => el.id !== "supportModal");
    if (!panes.length) return;
    document.body.classList.add("support-split");
    panes.forEach(el => el.classList.add("split-pane"));
    // Give both sides more room: fold the sidebar while the split is open (restored on close)
    const sidebar = $("#sidebar");
    if (sidebar && !sidebar.classList.contains("collapsed")) {
      sidebar.classList.add("collapsed");
      sidebar.dataset.splitCollapsed = "1";
    }
    if (!supportSplitObserver) {
      supportSplitObserver = new MutationObserver(() => {
        $$(".split-pane").filter(el => !el.classList.contains("open")).forEach(el => el.classList.remove("split-pane"));
        if (!$$(".split-pane").length) exitSupportSplit();
      });
    }
    panes.forEach(el => supportSplitObserver.observe(el, { attributes: true, attributeFilter: ["class"] }));
  }

  function exitSupportSplit(closePanes = false) {
    if (supportSplitObserver) supportSplitObserver.disconnect();
    $$(".split-pane").forEach(el => {
      el.classList.remove("split-pane");
      if (closePanes) el.classList.remove("open");
    });
    $$("#supportTableBody tr.split-active").forEach(tr => tr.classList.remove("split-active"));
    const sidebar = $("#sidebar");
    if (sidebar && sidebar.dataset.splitCollapsed) {
      sidebar.classList.remove("collapsed");
      delete sidebar.dataset.splitCollapsed;
    }
    document.body.classList.remove("support-split");
  }

  function openRelatedRecordInner(recordId) {
    if (!recordId || recordId === "-" || recordId === "None") return;

    // Check if called from the Activity Logs page to preserve navigation context
    // Support page: the record opens beside the Support list (split view), so stay on Support too
    const fromActivity = state.currentPage === "activity" || state.currentPage === "support";

    // Close any open popovers or child modals
    $("#searchResultsPopover")?.classList.remove("open");

    if (recordId.startsWith("APP-")) {
      if (!fromActivity) go("applications");
      openAppDrawer(recordId);
    } else if (recordId.startsWith("JOB-")) {
      if (!fromActivity) go("installations");
      openInstallModal(recordId);
    } else if (recordId.startsWith("SUP-") || recordId.startsWith("TIC-")) {
      if (!fromActivity) go("support");
      openSupportModal(recordId);
    } else if (recordId.startsWith("INQ-")) {
      if (!fromActivity) go("inquiries");
      openInquiryModal(recordId);
    } else if (recordId.startsWith("CUS-")) {
      if (!fromActivity) {
        go("accounts");
        switchAccountTab("customers");
      }
      openAccountModal("customers", recordId);
    } else if (recordId.startsWith("FIN-")) {
      if (!fromActivity) {
        go("accounts");
        switchAccountTab("financers");
      }
      openAccountModal("financers", recordId);
    } else if (recordId.startsWith("INS-")) {
      if (!fromActivity) {
        go("accounts");
        switchAccountTab("installers");
      }
      openAccountModal("installers", recordId);
    } else if (recordId.startsWith("MER-")) {
      if (!fromActivity) {
        go("accounts");
        switchAccountTab("merchants");
      }
      openAccountModal("merchants", recordId);
    } else if (recordId.startsWith("PAY-")) {
      // Find linked application ID from payment schedule or reference
      let appId = null;
      const appMatch = recordId.match(/APP-\d+/);
      if (appMatch) {
        appId = appMatch[0];
      } else {
        const numMatch = recordId.match(/PAY-(\d+)/);
        if (numMatch) {
          const candidate = `APP-${numMatch[1]}`;
          if (db.data.applications.some(a => a.id === candidate)) {
            appId = candidate;
          }
        }
      }
      if (!appId) {
        for (const [key, sched] of Object.entries(db.data.paymentSchedules || {})) {
          if (sched && sched.history && sched.history.some(h => h.id === recordId || h.ref === recordId)) {
            appId = key;
            break;
          }
        }
      }
      if (appId) {
        openPaymentModal(appId);
      } else {
        if (!fromActivity) go("payments");
      }
    } else if (recordId === "SETTINGS") {
      go("settings");
    } else {
      const app = db.data.applications.find(a => a.id === recordId);
      if (app) {
        if (!fromActivity) go("applications");
        openAppDrawer(recordId);
        return;
      }
      const job = db.data.installations.find(j => j.id === recordId);
      if (job) {
        if (!fromActivity) go("installations");
        openInstallModal(recordId);
        return;
      }
      const ticket = db.data.support.find(s => s.id === recordId);
      if (ticket) {
        if (!fromActivity) go("support");
        openSupportModal(recordId);
        return;
      }
      const inq = (db.getInquiries ? db.getInquiries() : []).find(i => i.id === recordId);
      if (inq) {
        if (!fromActivity) go("inquiries");
        openInquiryModal(recordId);
        return;
      }
      const cus = db.data.customers.find(c => c.id === recordId);
      if (cus) {
        if (!fromActivity) { go("accounts"); switchAccountTab("customers"); }
        openAccountModal("customers", recordId);
        return;
      }
      const fin = db.data.financers.find(f => f.id === recordId);
      if (fin) {
        if (!fromActivity) { go("accounts"); switchAccountTab("financers"); }
        openAccountModal("financers", recordId);
        return;
      }
      const ins = db.data.installers.find(i => i.id === recordId);
      if (ins) {
        if (!fromActivity) { go("accounts"); switchAccountTab("installers"); }
        openAccountModal("installers", recordId);
        return;
      }
      const mer = db.data.merchants.find(m => m.id === recordId);
      if (mer) {
        if (!fromActivity) { go("accounts"); switchAccountTab("merchants"); }
        openAccountModal("merchants", recordId);
        return;
      }
    }
  }

  function renderSupport() {
    const support = db.data.support;

    // Filter counts (dynamically calculated from centralized support records)
    if ($("#supportCountAll")) $("#supportCountAll").textContent = support.length;
    if ($("#supportCountOpen")) $("#supportCountOpen").textContent = support.filter(s => s.status === "Open").length;
    if ($("#supportCountProgress")) $("#supportCountProgress").textContent = support.filter(s => s.status === "In Progress").length;
    if ($("#supportCountResolved")) $("#supportCountResolved").textContent = support.filter(s => s.status === "Resolved").length;

    // Sidebar badge: unresolved tickets only (Open + In Progress)
    const unresolvedSupport = support.filter(s => s.status === "Open" || s.status === "In Progress").length;
    if ($("#navBadgeSupport")) $("#navBadgeSupport").textContent = unresolvedSupport;

    const filtered = support.filter(ticket => {
      const matchStatus = state.supportStatusFilter === "All" || ticket.status === state.supportStatusFilter;
      const matchPortal = state.supportPortalFilter === "All" || ticket.accountType === state.supportPortalFilter;
      const matchPriority = state.supportPriorityFilter === "All" || ticket.priority === state.supportPriorityFilter;

      const q = state.supportSearchQuery.toLowerCase().trim();
      const matchSearch = !q || (
        ticket.id.toLowerCase().includes(q) ||
        ticket.accountName.toLowerCase().includes(q) ||
        ticket.concern.toLowerCase().includes(q) ||
        ticket.relatedId.toLowerCase().includes(q)
      );

      return matchStatus && matchPortal && matchPriority && matchSearch;
    });

    // Unresolved ticket ordering: High priority first -> then oldest waiting ticket
    const priorityWeight = { "High": 3, "Medium": 2, "Low": 1 };
    filtered.sort((a, b) => {
      const aResolved = a.status === "Resolved";
      const bResolved = b.status === "Resolved";
      if (aResolved !== bResolved) {
        return aResolved ? 1 : -1; // Unresolved tickets first
      }

      if (!aResolved) {
        // High priority first
        const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        if (pDiff !== 0) return pDiff;
      }

      // Oldest waiting ticket first (earlier created timestamp = waited longer)
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    });

    const tbody = $("#supportTableBody");
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--muted);">No support tickets found matching the filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
      const actionLabel = t.status === "Resolved" ? "View Ticket" : "Manage Ticket";
      const priorityClass = t.priority === "High" ? "danger" : (t.priority === "Medium" ? "warn" : "neutral");

      return `
        <tr>
          <td style="white-space: nowrap;"><span class="record-id" data-manage-ticket="${t.id}" title="Open ticket ${t.id}">${t.id}</span></td>
          <td><span class="status-pill neutral">${t.accountType}</span></td>
          <td>
            <div style="display:inline-flex; flex-direction:column; align-items:flex-start; gap:2px;">
              <button type="button" class="record-link-btn" data-open-record="${t.relatedId}" title="Open related record ${t.relatedId}">${t.relatedId} ↗</button>
              <span class="sub-info">${t.accountName}</span>
            </div>
          </td>
          <td><span style="font-weight:600;" title="${safeText(t.concern)}">${t.concern}</span>${t.topic && t.topic !== t.concern ? `<span class="sub-info">${safeText(t.topic)}</span>` : ""}</td>
          <td><span class="status-pill ${priorityClass}">${t.priority}</span>${t.urgency ? `<span class="sub-info" title="What the customer picked">${safeText(t.urgency)}</span>` : ""}</td>
          <td><span class="status-pill ${getStatusClass(t.status)}">${t.status}</span></td>
          <td><span class="sub-info" style="margin:0;">${t.created}</span></td>
          <td style="text-align: right;">
            <button class="btn btn-secondary btn-sm" data-manage-ticket="${t.id}">${actionLabel}</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  function switchSupportModalTab(tabKey) {
    state.supportCurrentTab = tabKey;
    $$("#supportModalTabs .modal-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.sptab === tabKey);
    });

    $$("#supportModal .modal-tab-content").forEach(content => {
      content.classList.toggle("active", content.id === `spTabContent${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
    });
  }

  function openSupportModal(ticketId) {
    const t = db.data.support.find(x => x.id === ticketId);
    if (!t) return;

    state.selectedTicketId = ticketId;

    // Header elements
    if ($("#smTitle")) $("#smTitle").textContent = `Ticket ${t.id} · ${t.accountName}`;
    if ($("#smStatusBadge")) {
      $("#smStatusBadge").className = `status-pill ${getStatusClass(t.status)}`;
      $("#smStatusBadge").textContent = t.status;
    }
    if ($("#smPriorityBadge")) {
      const pClass = t.priority === "High" ? "danger" : (t.priority === "Medium" ? "warn" : "neutral");
      $("#smPriorityBadge").className = `status-pill ${pClass}`;
      $("#smPriorityBadge").textContent = t.urgency ? `${t.priority} · ${t.urgency}` : `${t.priority} Priority`;
    }

    // Tab 1: Overview
    if ($("#smTicketId")) $("#smTicketId").value = t.id;
    if ($("#smDetailTicketId")) $("#smDetailTicketId").textContent = t.id;
    if ($("#smAccountType")) $("#smAccountType").textContent = t.accountType;
    if ($("#smAccountName")) $("#smAccountName").textContent = t.accountName;

    const relBtn = $("#smRelatedBtn");
    if (relBtn) {
      relBtn.textContent = `${t.relatedId} ↗`;
      relBtn.dataset.openRecord = t.relatedId;
    }

    if ($("#smConcern")) $("#smConcern").textContent = t.concern;
    if ($("#smPrioritySelect")) $("#smPrioritySelect").value = t.priority;
    if ($("#smCurrentStatusPill")) {
      $("#smCurrentStatusPill").className = `status-pill ${getStatusClass(t.status)}`;
      $("#smCurrentStatusPill").textContent = t.status;
    }
    if ($("#smCreatedTime")) $("#smCreatedTime").textContent = t.created;
    if ($("#smAssignedAdminSelect")) $("#smAssignedAdminSelect").value = t.assignedTo || "ADMIN (Limuel)";

    // Workflow controls based on status
    const isResolved = t.status === "Resolved";
    if ($("#smActiveControls")) $("#smActiveControls").style.display = isResolved ? "none" : "block";
    if ($("#smResolvedControls")) $("#smResolvedControls").style.display = isResolved ? "block" : "none";
    if ($("#btnSaveSupportTicket")) $("#btnSaveSupportTicket").style.display = isResolved ? "none" : "inline-flex";

    if (!isResolved) {
      if ($("#smStatusSelect")) $("#smStatusSelect").value = t.status;
      if ($("#smNotesInput")) $("#smNotesInput").value = t.notes || "";
      if ($("#smResolutionInput")) $("#smResolutionInput").value = t.resolutionNote || "";
      if ($("#smResolutionGroup")) $("#smResolutionGroup").style.display = "none";
      if ($("#smResolutionError")) $("#smResolutionError").style.display = "none";
    } else {
      if ($("#smResolvedBy")) $("#smResolvedBy").textContent = t.resolvedBy || "ADMIN (Limuel)";
      if ($("#smResolvedAt")) $("#smResolvedAt").textContent = t.resolvedAt || "Previously";
      if ($("#smResolvedNote")) $("#smResolvedNote").textContent = t.resolutionNote || t.notes || "Issue resolved and confirmed with requester.";
      if ($("#smReopenTriggerBox")) $("#smReopenTriggerBox").style.display = "block";
      if ($("#smReopenBox")) $("#smReopenBox").style.display = "none";
      if ($("#smReopenReasonInput")) $("#smReopenReasonInput").value = "";
    }

    // Tab 2: Conversation
    if ($("#smMsgCount")) $("#smMsgCount").textContent = (t.messages || []).length;
    if ($("#smReplyRecipient")) $("#smReplyRecipient").textContent = t.accountName;
    if ($("#smReplyInput")) $("#smReplyInput").value = "";

    const msgList = $("#smMessagesList");
    if (msgList) {
      if (!t.messages || !t.messages.length) {
        msgList.innerHTML = `<div style="text-align:center; padding:24px; color:var(--muted);">No messages in this conversation yet.</div>`;
      } else {
        msgList.innerHTML = t.messages.map(m => {
          const isAdmin = m.role === "Admin";
          return `
            <div class="support-msg ${isAdmin ? 'admin' : 'requester'}">
              <div class="support-msg-head">
                <span class="support-msg-sender" style="color:${isAdmin ? 'var(--accent)' : 'var(--ink)'};">${m.sender}</span>
                <span class="support-msg-time">${m.time}</span>
              </div>
              <div>${m.text}</div>
            </div>
          `;
        }).join("");
      }
    }

    // Tab 3: Activity
    const activities = db.getTicketActivity(t.id);
    if ($("#smActCount")) $("#smActCount").textContent = activities.length;
    const actTimeline = $("#smActivityTimeline");
    if (actTimeline) {
      if (!activities.length) {
        actTimeline.innerHTML = `<div style="text-align:center; padding:24px; color:var(--muted);">No activity records for this ticket yet.</div>`;
      } else {
        actTimeline.innerHTML = activities.map(act => `
          <div class="timeline-step">
            <div class="timeline-dot ${act.role === 'Admin' ? 'active' : ''}"></div>
            <div class="timeline-content">
              <div class="timeline-head">
                <span class="timeline-role role-${(act.role || 'Admin').toLowerCase()}">${act.role}</span>
                <span class="timeline-user">${act.user}</span>
                <span class="timeline-time">${calculateRelativeTime(act.timestamp || act.exactTime) || act.exactTime || act.time || "Recent"}</span>
              </div>
              <div class="timeline-action">${act.action}</div>
            </div>
          </div>
        `).join("");
      }
    }

    // Open on default tab
    switchSupportModalTab(state.supportCurrentTab || "overview");
    $("#supportModal")?.classList.add("open");
  }

  function saveSupportModal() {
    const ticketId = $("#smTicketId")?.value;
    const newStatus = $("#smStatusSelect")?.value;
    const priority = $("#smPrioritySelect")?.value;
    const assignedTo = $("#smAssignedAdminSelect")?.value;
    const notes = $("#smNotesInput")?.value;
    const resolutionNote = $("#smResolutionInput")?.value;

    if (!ticketId) return;

    if (newStatus === "Resolved") {
      if (!resolutionNote || !resolutionNote.trim()) {
        if ($("#smResolutionGroup")) $("#smResolutionGroup").style.display = "block";
        if ($("#smResolutionError")) $("#smResolutionError").style.display = "block";
        $("#smResolutionInput")?.focus();
        showToast("A resolution note is required when resolving a ticket", "danger", "⚠");
        return;
      }
      db.resolveSupportTicket(ticketId, resolutionNote);
      $("#supportModal")?.classList.remove("open");
      showToast(`Ticket ${ticketId} resolved successfully`, "success", "✔");
    } else {
      db.updateSupportTicket(ticketId, newStatus, priority, notes, assignedTo);
      $("#supportModal")?.classList.remove("open");
      showToast(`Ticket ${ticketId} updated to "${newStatus}"`, "success", "🎧");
    }

    updateBadgesAndKPIs();
    renderSupport();
    if (typeof renderOverview === "function") renderOverview();
  }

  function confirmReopenAction() {
    const ticketId = $("#smTicketId")?.value;
    if (!ticketId) return;
    const reason = $("#smReopenReasonInput")?.value || "";

    db.reopenSupportTicket(ticketId, reason);
    showToast(`Ticket ${ticketId} reopened as In Progress`, "success", "↺");

    // Refresh modal to show updated active state
    openSupportModal(ticketId);
    updateBadgesAndKPIs();
    renderSupport();
    if (typeof renderOverview === "function") renderOverview();
  }

  function sendTicketReplyAction() {
    const ticketId = $("#smTicketId")?.value;
    const replyText = $("#smReplyInput")?.value;

    if (!ticketId) return;
    if (!replyText || !replyText.trim()) {
      showToast("Please enter a reply message", "warn", "💬");
      return;
    }

    db.addTicketMessage(ticketId, replyText);
    showToast(`Reply sent to requester`, "success", "💬");

    // Refresh modal
    openSupportModal(ticketId);
    switchSupportModalTab("conversation");
    updateBadgesAndKPIs();
    renderSupport();
    if (typeof renderOverview === "function") renderOverview();
  }

  // ==================== 6B. CONTACT INQUIRIES PAGE ====================
  // Buy Now with a down payment receipt: the account is created automatically, so there is no Inquiry Confirmation step
  function buyNowAccountInfo(inq) {
    if (!inq || !inq.paymentProof || inq.paymentProof.purpose !== "Down Payment") return null;
    if (inq.customerId) {
      return { label: "Account Created", cls: "success",
        note: `Customer account ${inq.customerId} was created automatically after the down payment receipt. The activation link was queued to ${inq.email}.` };
    }
    if (inq.autoAccountError) {
      const email = String(inq.email || "").toLowerCase();
      const existing = (db.data.customers || []).find(c => String(c.email || "").toLowerCase() === email);
      return { label: "Existing Account", cls: "warn",
        note: existing
          ? `${inq.email} already has customer account ${existing.id} (${existing.name}), so no new account was created. Contact the customer about this order.`
          : `No account was created: ${inq.autoAccountError}` };
    }
    return null;
  }

  function renderInquiries() {
    const inquiries = db.getInquiries ? db.getInquiries() : [];

    // Filter counts
    const totalCount = inquiries.length;
    const unreadCount = inquiries.filter(i => i.status === "Unread").length;
    const repliedCount = inquiries.filter(i => i.status === "Replied").length;

    if ($("#inquiryCountAll")) $("#inquiryCountAll").textContent = totalCount;
    if ($("#inquiryCountUnread")) $("#inquiryCountUnread").textContent = unreadCount;
    if ($("#inquiryCountReplied")) $("#inquiryCountReplied").textContent = repliedCount;

    // KPI cards
    if ($("#inqKpiTotal")) $("#inqKpiTotal").textContent = totalCount;
    if ($("#inqKpiUnread")) $("#inqKpiUnread").textContent = unreadCount;
    if ($("#inqKpiReplied")) $("#inqKpiReplied").textContent = repliedCount;

    // Latest inquiry
    const latestInq = inquiries[0];
    if (latestInq) {
      if ($("#inqKpiLatest")) $("#inqKpiLatest").textContent = latestInq.submitted || calculateRelativeTime(latestInq.timestamp) || "Recent";
      if ($("#inqKpiLatestSender")) $("#inqKpiLatestSender").textContent = latestInq.name || "Landing Page Lead";
    }

    // Filter records
    const filtered = inquiries.filter(inq => {
      const matchStatus = state.inquiryStatusFilter === "All" || inq.status === state.inquiryStatusFilter;
      const matchCategory = state.inquiryCategoryFilter === "All" || inq.category === state.inquiryCategoryFilter;
      const inqStatus = inq.inquiryStatus || (inq.customerResponse === 'Proceed' ? 'Proceed' : (inq.customerResponse === 'Not Proceed' || inq.customerResponse === 'Not Proceeding' ? 'Not Proceeding' : (inq.status === 'Replied' || inq.customerResponse === 'Awaiting Response' ? 'Awaiting Response' : 'Not Sent')));
      const matchResponse = !state.inquiryResponseFilter || state.inquiryResponseFilter === "All" ||
        inqStatus === state.inquiryResponseFilter ||
        inq.customerResponse === state.inquiryResponseFilter ||
        (state.inquiryResponseFilter === "Not Proceed" && inqStatus === "Not Proceeding") ||
        (state.inquiryResponseFilter === "Not Proceeding" && (inq.customerResponse === "Not Proceed" || inqStatus === "Not Proceeding"));
      const matchPayment = !state.inquiryPaymentFilter || state.inquiryPaymentFilter === "All" || inq.paymentPreference === state.inquiryPaymentFilter;

      const q = state.inquirySearchQuery.toLowerCase().trim();
      const matchSearch = !q || (
        (inq.id && inq.id.toLowerCase().includes(q)) ||
        (inq.name && inq.name.toLowerCase().includes(q)) ||
        (inq.email && inq.email.toLowerCase().includes(q)) ||
        (inq.phone && inq.phone.toLowerCase().includes(q)) ||
        (inq.location && inq.location.toLowerCase().includes(q)) ||
        (inq.category && inq.category.toLowerCase().includes(q)) ||
        (inq.package && inq.package.toLowerCase().includes(q)) ||
        (inq.selectedSolarModel && inq.selectedSolarModel.toLowerCase().includes(q)) ||
        (inq.electricBill && inq.electricBill.toLowerCase().includes(q)) ||
        (inq.paymentPreference && inq.paymentPreference.toLowerCase().includes(q)) ||
        (inqStatus && inqStatus.toLowerCase().includes(q)) ||
        (inq.customerResponse && inq.customerResponse.toLowerCase().includes(q)) ||
        (inq.subject && inq.subject.toLowerCase().includes(q)) ||
        (inq.message && inq.message.toLowerCase().includes(q))
      );

      return matchStatus && matchCategory && matchResponse && matchPayment && matchSearch;
    });

    // Unread first, then latest timestamp
    filtered.sort((a, b) => {
      const aUnread = a.status === "Unread";
      const bUnread = b.status === "Unread";
      if (aUnread !== bUnread) return aUnread ? -1 : 1;
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });

    const tbody = $("#inquiriesTableBody");
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:36px; color:var(--muted);">No contact inquiries found matching the current filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(inq => {
      const isUnread = inq.status === "Unread";
      const statusPillClass = isUnread ? "warn" : "success";
      const actionLabel = isUnread ? "Review" : "View";
      const relativeTime = inq.submitted || calculateRelativeTime(inq.timestamp) || "Recent";

      // Partner inquiries (Financer / Installer / Merchant) from the landing page Contact Us form
      if (db.isPartnerInquiry && db.isPartnerInquiry(inq)) {
        const pStatus = partnerInquiryStatusLabel(inq);
        const pClass = inq.accountCreated ? "success" : (inq.inquiryStatus === "Approved" ? "success" : "warn");
        const createAction = inq.accountCreated
          ? `<button type="button" class="btn btn-secondary btn-sm inquiry-create-action" disabled>Account Created · ${safeText(inq.linkedAccountId || "")}</button>`
          : (inq.inquiryStatus === "Approved"
            ? `<button type="button" class="btn btn-secondary btn-sm inquiry-create-action" data-create-partner-account="${safeText(inq.id)}">Create ${safeText(partnerAccountLabel(inq))}</button>`
            : "");
        return `
        <tr style="${isUnread ? 'background: rgba(245, 158, 11, 0.03);' : ''}">
          <td>
            <div style="display:flex; flex-direction:column; gap:1px;">
              <strong style="font-size:13px; color:var(--ink);">${safeText(inq.name)}</strong>
              <span style="font-size:12px; color:var(--ink-secondary);">${safeText(inq.subject || inq.category)}</span>
            </div>
          </td>
          <td>
            <span class="status-pill direct" style="font-size:11px;">${safeText(partnerTypeLabel(inq))}</span>
          </td>
          <td>
            <span style="font-size:12px; color:var(--muted);">—</span>
          </td>
          <td>
            <span class="status-pill ${statusPillClass}">${safeText(inq.status)}</span>
          </td>
          <td>
            <span class="status-pill ${pClass}">${safeText(pStatus)}</span>
          </td>
          <td>
            <span style="font-size:12px; color:var(--ink);">${safeText(relativeTime)}</span>
          </td>
          <td class="inquiry-actions-cell">
            <div class="inquiry-actions">
              <button type="button" class="btn btn-secondary btn-sm" data-manage-inquiry="${safeText(inq.id)}">${actionLabel}</button>
              ${createAction}
            </div>
          </td>
        </tr>
      `;
      }

      const paymentPref = inq.paymentPreference || "Full Payment";
      const paymentPrefCell = paymentPref === "Not specified"
        ? `<span style="font-size:12px; color:var(--muted);">—</span>`
        : `<span class="status-pill neutral" style="font-size:11px; font-weight:600;">${safeText(paymentPref)}</span>`;
      const inqStatus = inq.inquiryStatus || (inq.customerResponse === 'Proceed' ? 'Proceed' : (inq.customerResponse === 'Not Proceed' || inq.customerResponse === 'Not Proceeding' ? 'Not Proceeding' : (inq.status === 'Replied' || inq.customerResponse === 'Awaiting Response' ? 'Awaiting Response' : 'Not Sent')));
      const autoAccount = buyNowAccountInfo(inq);
      const responsePillClass = autoAccount ? autoAccount.cls : (inqStatus === "Proceed" ? "success" : (inqStatus === "Not Proceeding" || inq.customerResponse === "Not Proceed" ? "danger" : "warn"));
      const canCreateAccount = inqStatus === "Proceed" || inq.customerResponse === "Proceed";

      return `
        <tr style="${isUnread ? 'background: rgba(245, 158, 11, 0.03);' : ''}">
          <td>
            <div style="display:flex; flex-direction:column; gap:1px;">
              <strong style="font-size:13px; color:var(--ink);">${safeText(inq.name)}</strong>
              <span style="font-size:12px; color:var(--ink-secondary);">${safeText(inq.subject || inq.category)}</span>
            </div>
          </td>
          <td>
            <span class="status-pill neutral" style="font-size:11px;">${safeText(inq.category)}</span>
          </td>
          <td>
            ${paymentPrefCell}
          </td>
          <td>
            <span class="status-pill ${statusPillClass}">${safeText(inq.status)}</span>
          </td>
          <td>
            <span class="status-pill ${responsePillClass}">${safeText(autoAccount ? autoAccount.label : inqStatus)}</span>
          </td>
          <td>
            <span style="font-size:12px; color:var(--ink);">${safeText(relativeTime)}</span>
          </td>
          <td class="inquiry-actions-cell">
            <div class="inquiry-actions">
              <button type="button" class="btn btn-secondary btn-sm" data-manage-inquiry="${safeText(inq.id)}">${actionLabel}</button>
              ${canCreateAccount ? `
                <button type="button" class="btn btn-secondary btn-sm inquiry-create-action" data-create-inquiry="${safeText(inq.id)}" ${inq.customerId ? 'disabled' : ''}>
                  ${inq.customerId ? `Customer Created · ${safeText(inq.customerId)}` : 'Create Customer Account'}
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  // "Financer Partner" for typed inquiries, "Partner" when the role is chosen at account creation
  function partnerTypeLabel(inq) {
    return inq && inq.partnerType ? `${inq.partnerType} Partner` : "Partner";
  }
  function partnerAccountLabel(inq) {
    return inq && inq.partnerType ? `${inq.partnerType} Account` : "Partner Account";
  }

  function partnerInquiryStatusLabel(inq) {
    if (inq.accountCreated) return "Account Created";
    return inq.inquiryStatus || "Pending Review";
  }

  // Partner review panel inside the inquiry modal; hides customer-only sections for partner inquiries
  function renderPartnerInquiryPanel(inq) {
    const isPartner = !!(db.isPartnerInquiry && db.isPartnerInquiry(inq));
    $$("#inquiryModal .inq-customer-only, #inquiryModal .inquiry-email-flow-card").forEach(el => {
      el.style.display = isPartner ? "none" : "";
    });
    const panel = $("#inqPartnerPanel");
    if (!panel) return;
    panel.style.display = isPartner ? "block" : "none";
    if (!isPartner) return;

    const p = inq.financerProposal || null;
    const status = partnerInquiryStatusLabel(inq);
    $("#inqPartnerType").textContent = partnerTypeLabel(inq);
    $("#inqPartnerStatus").className = `status-pill ${inq.accountCreated || inq.inquiryStatus === "Approved" ? "success" : "warn"}`;
    $("#inqPartnerStatus").textContent = status;
    // Financer: editable agreed terms until the account exists, then read-only
    const isFin = inq.partnerType === "Financer";
    const editTerms = isFin && !inq.accountCreated;
    $("#inqPartnerTermsEdit").style.display = editTerms ? "block" : "none";
    $("#inqPartnerFinancerRow").style.display = isFin && !editTerms ? "" : "none";
    if (editTerms) {
      $("#inqPartnerTermInput").value = p && p.contractTermMonths ? p.contractTermMonths : "";
      $("#inqPartnerRateInput").value = p && p.annualRate != null ? p.annualRate : "";
      $("#inqPartnerStartInput").value = p && p.contractStartDate ? p.contractStartDate : "";
      $("#btnSavePartnerTerms").dataset.inquiryId = inq.id;
      const msg = $("#inqPartnerTermsMsg");
      msg.style.color = "";
      msg.textContent = p ? `Saved · ${p.contractTermMonths} mo @ ${p.annualRate}% from ${formatReadableDate(p.contractStartDate)}` : "";
    }
    if (isFin) {
      $("#inqPartnerTerm").textContent = p && p.contractTermMonths ? `${p.contractTermMonths} months` : "Not provided";
      $("#inqPartnerRate").textContent = p && p.annualRate !== undefined && p.annualRate !== null ? `${p.annualRate}% p.a.` : "Not provided";
      $("#inqPartnerStart").textContent = p && p.contractStartDate ? formatReadableDate(p.contractStartDate) : "Not provided";
    }

    // Partner type picked by Super Admin from the message
    const typeSel = $("#inqPartnerTypeSelect");
    if (typeSel) {
      typeSel.value = inq.partnerType || "";
      typeSel.disabled = !!inq.accountCreated;
      typeSel.dataset.inquiryId = inq.id;
      const hint = $("#inqPartnerTypeHint");
      const guess = suggestPartnerType(inq.message);
      if (hint) hint.textContent = !inq.partnerType && guess ? `Suggested: ${guess}` : "";
    }

    const approveBtn = $("#btnApprovePartnerInquiry");
    const createBtn = $("#btnCreatePartnerAccount");
    const note = $("#inqPartnerNote");
    approveBtn.style.display = inq.inquiryStatus === "Approved" || inq.accountCreated ? "none" : "inline-flex";
    approveBtn.dataset.approvePartnerInquiry = inq.id;
    createBtn.style.display = inq.inquiryStatus === "Approved" ? "inline-flex" : "none";
    createBtn.dataset.createPartnerAccount = inq.id;
    createBtn.disabled = !!inq.accountCreated || !inq.partnerType;
    createBtn.title = !inq.partnerType && !inq.accountCreated ? "Select the partner type first" : "";
    createBtn.textContent = inq.accountCreated ? `Account Created · ${inq.linkedAccountId || ""}` : `Create ${partnerAccountLabel(inq)}`;
    if (inq.accountCreated) {
      note.textContent = `Linked to ${inq.partnerType} account ${inq.linkedAccountId}.`;
    } else if (inq.inquiryStatus === "Approved") {
      note.textContent = inq.partnerType
        ? `Approved${inq.approvedBy ? ` by ${inq.approvedBy}` : ""}.${isFin && !p ? " Save the contract terms before creating the account." : ""}`
        : `Approved${inq.approvedBy ? ` by ${inq.approvedBy}` : ""}. Select the partner type to create the account.`;
    } else {
      note.textContent = "Review the message, then approve.";
    }
  }

  // Keyword hint only — Super Admin makes the final choice
  function suggestPartnerType(message) {
    const m = String(message || "").toLowerCase();
    if (/financ|loan|lend|bank|credit|fund/.test(m)) return "Financer";
    if (/install|contractor|electrician|engineer|technician|roof/.test(m)) return "Installer";
    if (/suppl|product|equipment|distribut|wholesale|panel|inverter|batter|merchant|sell|store/.test(m)) return "Merchant";
    return "";
  }

  function prefillPartnerInquiry(inq) {
    const values = {
      newAccFirstName: inq.createAccountPrefill?.firstName || inq.firstName || "",
      newAccLastName: inq.createAccountPrefill?.lastName || inq.lastName || "",
      newAccEmail: inq.createAccountPrefill?.email || inq.email || "",
      newAccPhone: inq.createAccountPrefill?.phone || inq.phone || ""
    };
    Object.entries(values).forEach(([field, value]) => {
      const input = document.getElementById(field);
      if (input) input.value = value;
    });
    const p = inq.financerProposal;
    const notes = [
      `Partner inquiry ${inq.id}${inq.partnerType ? ` (${inq.partnerType})` : ""}`,
      p ? `Proposed contract: ${p.contractTermMonths} months @ ${p.annualRate}% p.a., starting ${p.contractStartDate}` : "",
      inq.message ? `Message: ${inq.message}` : ""
    ].filter(Boolean).join("\n");
    if ($("#newAccNotes")) $("#newAccNotes").value = notes;
  }

  function updateInquiryModalButtons(inq) {
    const createBtn = $('#btnInquiryCreateCustomer');
    const closeBtn = $('#btnInquiryClose');
    const resp = inq.inquiryStatus || inq.customerResponse || 'Awaiting Response';

    if (resp === 'Proceed') {
      if (createBtn) {
        createBtn.style.display = 'inline-flex';
        createBtn.dataset.createInquiry = inq.id;
        if (inq.customerId) {
          createBtn.disabled = true;
          createBtn.textContent = `Customer Created · ${inq.customerId}`;
        } else {
          createBtn.disabled = false;
          createBtn.textContent = 'Create Customer Account';
        }
      }
      if (closeBtn) closeBtn.textContent = 'Close';
    } else if (resp === 'Not Proceed' || resp === 'Not Proceeding') {
      if (createBtn) {
        createBtn.style.display = 'none';
        createBtn.disabled = true;
      }
      if (closeBtn) closeBtn.textContent = 'Close Inquiry';
    } else { // 'Not Sent' or 'Awaiting Response'
      if (createBtn) {
        createBtn.style.display = 'none';
        createBtn.disabled = true;
      }
      if (closeBtn) closeBtn.textContent = 'Close';
    }
  }

  function openInquiryModal(inquiryId) {
    const inquiries = db.getInquiries ? db.getInquiries() : [];
    const inq = inquiries.find(i => i.id === inquiryId);
    if (!inq) return;

    state.selectedInquiryId = inquiryId;

    const inqStatus = inq.inquiryStatus || (inq.customerResponse === 'Proceed' ? 'Proceed' : (inq.customerResponse === 'Not Proceed' || inq.customerResponse === 'Not Proceeding' ? 'Not Proceeding' : (inq.status === 'Replied' || inq.customerResponse === 'Awaiting Response' ? 'Awaiting Response' : 'Not Sent')));

    // Header
    if ($("#inqModalTitle")) $("#inqModalTitle").textContent = `${inq.id} · ${inq.name}`;
    const converted = !!inq.customerId;
    if ($("#inqModalStatusBadge")) {
      const isUnread = inq.status === "Unread" && !converted;
      $("#inqModalStatusBadge").className = `status-pill ${isUnread ? "warn" : "success"}`;
      $("#inqModalStatusBadge").textContent = converted ? `Customer · ${inq.customerId}` : inq.status;
    }

    // Detail Grid
    if ($("#inqModalId")) $("#inqModalId").value = inq.id;
    if ($("#inqDetailId")) $("#inqDetailId").textContent = inq.id;
    if ($("#inqDetailTime")) $("#inqDetailTime").textContent = inq.submitted || calculateRelativeTime(inq.timestamp) || 'Recent';
    if ($("#inqDetailName")) $("#inqDetailName").textContent = inq.name;

    const emailEl = $("#inqDetailEmail");
    if (emailEl) {
      emailEl.href = `mailto:${encodeURIComponent(inq.email)}?subject=${encodeURIComponent("Re: " + (inq.subject || inq.selectedSolarModel || inq.package || "Hello Solar Inquiry"))}`;
      emailEl.innerHTML = `${safeText(inq.email)} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
    }

    const phoneEl = $("#inqDetailPhone");
    if (phoneEl) {
      phoneEl.href = `tel:${inq.phone.replace(/[^+\d]/g, "")}`;
      phoneEl.textContent = inq.phone;
    }

    if ($("#inqDetailLocation")) $("#inqDetailLocation").textContent = inq.location || "Philippines";
    if ($("#inqDetailModel")) $("#inqDetailModel").textContent = inq.selectedSolarModel || inq.package || "Custom Solar Package";
    if ($("#inqDetailPackage")) $("#inqDetailPackage").textContent = inq.selectedSolarModel || inq.package || "Custom Solar Package";
    if ($("#inqDetailElectricBill")) $("#inqDetailElectricBill").textContent = inq.electricBill || (inq.monthlyBill || "₱10,000 - ₱15,000");
    if ($("#inqDetailPaymentPreference")) {
      const pref = inq.paymentPreference === "Not specified" ? "—" : (inq.paymentPreference || "Full Payment");
      // Installment: show the term the customer picked on Buy Now (e.g. "Installment · 3 years")
      const picked = /installment/i.test(pref) && inq.requestType === "Buy Now" && Number(inq.termMonths) > 0 ? ` · ${termText(Number(inq.termMonths))}` : "";
      $("#inqDetailPaymentPreference").textContent = pref + picked;
    }
    // Landing page request type (Buy Now / Site Assessment) and the uploaded payment proof
    if ($("#inqDetailRequestRow")) {
      $("#inqDetailRequestRow").style.display = inq.requestType ? "" : "none";
      $("#inqDetailRequestType").textContent = inq.requestType
        ? `${inq.requestType}${inq.preferredVisitDate ? ` · ${svDate(inq.preferredVisitDate)}` : ""}` : "—";
    }
    if ($("#inqDetailProofRow")) {
      const proof = inq.paymentProof;
      $("#inqDetailProofRow").style.display = proof ? "" : "none";
      if (proof) {
        // Once the account exists, the receipt status follows Accounting's verification on the application
        const linkedApp = proof.purpose === "Down Payment" && inq.customerId
          ? (db.data.applications || []).find(a => (inq.appId && a.id === inq.appId) || (a.inquiryId === inq.id))
          : null;
        const proofStatus = linkedApp ? db.downPaymentState(linkedApp) : (proof.status || "Pending Verification");
        $("#inqDetailProof").innerHTML =
          `<strong>${peso(proof.amount)} ${safeText(proof.purpose || "")}</strong>` +
          `<span class="status-pill ${getStatusClass(proofStatus)}" style="font-size:11px;">${safeText(proofStatus)}</span>` +
          (proof.referenceNo ? `<span class="sub-info">Ref. ${safeText(proof.referenceNo)}</span>` : "") +
          (proof.dataUrl ? `<button type="button" class="btn btn-secondary btn-sm" id="btnInqViewProof">View receipt</button>` : "");
        const btn = $("#btnInqViewProof");
        if (btn) btn.onclick = () => openStoredFile(proof.dataUrl, { fileName: proof.fileName, title: `${proof.purpose || "Payment"} · ${inq.id}` });
      }
    }
    if ($("#inqDetailCategory")) $("#inqDetailCategory").textContent = inq.category || "General Inquiry";

    // Message Status & Customer Response Pills in Detail Grid
    if ($("#inqDetailMessageStatus")) {
      const isUnread = inq.status === "Unread";
      $("#inqDetailMessageStatus").className = `status-pill ${isUnread ? "warn" : "success"}`;
      $("#inqDetailMessageStatus").textContent = inq.status;
    }

    const autoAccount = buyNowAccountInfo(inq);
    if ($("#inqDetailCustomerResponse")) {
      const respPillClass = autoAccount ? autoAccount.cls : (inqStatus === "Proceed" ? "success" : (inqStatus === "Not Proceeding" || inq.customerResponse === "Not Proceed" ? "danger" : "warn"));
      $("#inqDetailCustomerResponse").className = `status-pill ${respPillClass}`;
      $("#inqDetailCustomerResponse").textContent = autoAccount ? autoAccount.label : inqStatus;
    }
    if ($("#inqDetailInquiryStatus")) {
      $("#inqDetailInquiryStatus").textContent = "";
    }

    // Confirmation Email Card
    const emailStatusBadge = $("#inqEmailStatusBadge");
    if (emailStatusBadge) {
      if (inq.confirmationEmailSentAt) {
        emailStatusBadge.className = "status-pill success";
        emailStatusBadge.textContent = "Email Sent";
      } else {
        emailStatusBadge.className = "status-pill warn";
        emailStatusBadge.textContent = "Not Sent";
      }
    }

    const custRespCardBadge = $("#inqCustomerResponseCardBadge");
    if (custRespCardBadge) {
      const resp = inq.customerResponse || inqStatus;
      const isProceed = resp === "Proceed" || inqStatus === "Proceed";
      const isNotProceed = resp === "Not Proceed" || inqStatus === "Not Proceeding";
      custRespCardBadge.className = `status-pill ${isProceed ? "success" : (isNotProceed ? "danger" : "warn")}`;
      custRespCardBadge.textContent = isProceed ? "Customer: Proceed" : (isNotProceed ? "Customer: Not Proceeding" : "Customer: Awaiting Response");
    }

    const emailDesc = $("#inqEmailStatusDesc");
    if (emailDesc) {
      if (inq.confirmationEmailSentAt) {
        emailDesc.textContent = `Sent to ${inq.email} · ${calculateRelativeTime(inq.confirmationEmailSentAt) || "recently"}`;
      } else {
        emailDesc.textContent = `Not sent yet · ${inq.email}`;
      }
    }

    const sendBtnText = $("#btnSendInquiryConfirmationEmailText");
    if (sendBtnText) {
      sendBtnText.textContent = inq.confirmationEmailSentAt ? "Resend Confirmation Email" : "Send Confirmation Email";
    }

    // Inquiry Confirmation link (internal only — included in the customer email, not shown to admin)
    const confUrl = buildInquiryConfirmationUrl(inq);

    const linkInput = $("#inqConfirmationLinkInput");
    if (linkInput) linkInput.value = confUrl;

    const openPageBtn = $("#btnOpenCustomerConfirmationPage");
    if (openPageBtn) openPageBtn.href = confUrl;

    const linkNote = $("#inqLinkStatusNote");
    if (linkNote) {
      const resp = inq.customerResponse || inqStatus;
      if (resp === 'Proceed') {
        linkNote.textContent = "Customer confirmed: Proceed";
      } else if (resp === 'Not Proceed' || resp === 'Not Proceeding') {
        linkNote.textContent = "Customer selected: Not Proceeding";
      } else if (inq.confirmationEmailSentAt) {
        linkNote.textContent = "Awaiting customer response";
      } else {
        linkNote.textContent = "Email not yet sent";
      }
    }

    // Exact message sent with the Inquiry Confirmation link (saved by Super Admin)
    const msgInput = $("#inqConfirmationMessageInput");
    if (msgInput) {
      msgInput.value = inq.confirmationMessage || (db.getDefaultInquiryConfirmationMessage ? db.getDefaultInquiryConfirmationMessage(inq) : "");
      msgInput.classList.remove("input-error");
    }
    $("#errInqConfirmationMessage")?.classList.remove("visible");
    const msgMeta = $("#inqConfirmationMessageMeta");
    if (msgMeta) {
      msgMeta.textContent = inq.confirmationMessageUpdatedAt
        ? `Saved${inq.confirmationMessageUpdatedBy ? ` by ${inq.confirmationMessageUpdatedBy}` : ""} · ${calculateRelativeTime(inq.confirmationMessageUpdatedAt) || "recently"}`
        : (inq.confirmationMessage ? "Saved message" : "Default message · not saved yet");
    }

    // Update Modal Buttons based on Customer Response
    updateInquiryModalButtons(inq);
    renderPartnerInquiryPanel(inq);

    // Message
    if ($("#inqDetailSubject")) $("#inqDetailSubject").textContent = inq.subject || inq.category;
    if ($("#inqDetailMessage")) $("#inqDetailMessage").textContent = inq.message || "(No message body provided)";

    // External Email Compose button
    const emailComposeBtn = $("#btnInquiryEmailCompose");
    if (emailComposeBtn) {
      const emailSubj = encodeURIComponent(`Re: ${inq.subject || "Hello Solar Inquiry"}`);
      const emailBody = encodeURIComponent(`Hi ${inq.name},\n\nThank you for reaching out to Hello Solar regarding ${inq.selectedSolarModel || inq.package || inq.category}.\n\n`);
      emailComposeBtn.href = `mailto:${inq.email}?subject=${emailSubj}&body=${emailBody}`;
    }

    // Once the customer account exists, the confirmation editor and reply note are no longer needed
    if ($("#inqConfirmationEditor")) $("#inqConfirmationEditor").style.display = converted || autoAccount ? "none" : "";
    // Buy Now: the card shows the automatic account result instead of the confirmation flow
    const confTitle = $(".inquiry-email-flow-card .sa-card-title");
    if (confTitle) confTitle.textContent = autoAccount ? "Customer Account" : "Inquiry Confirmation";
    if (autoAccount) {
      if (emailStatusBadge) { emailStatusBadge.className = `status-pill ${autoAccount.cls}`; emailStatusBadge.textContent = autoAccount.label; }
      if (custRespCardBadge) custRespCardBadge.style.display = "none";
      if (emailDesc) emailDesc.textContent = autoAccount.note;
    } else if (custRespCardBadge) {
      custRespCardBadge.style.display = "";
    }

    // Status Banner & Forms
    const isReplied = inq.status === "Replied";
    const banner = $("#inqRepliedBanner");
    const replyForm = $("#inqReplyForm");

    if (banner) banner.style.display = isReplied ? "block" : "none";
    if (replyForm) replyForm.style.display = isReplied || converted ? "none" : "block";

    if (isReplied) {
      const rep = inq.reply || {};
      if ($("#inqRepliedBy")) $("#inqRepliedBy").textContent = rep.repliedBy || "ADMIN (Limuel)";
      if ($("#inqRepliedAt")) $("#inqRepliedAt").textContent = rep.repliedAt || "Earlier";
      if ($("#inqRepliedNote")) $("#inqRepliedNote").textContent = rep.replyNote || "Inquiry addressed via direct customer communication.";
    } else {
      if ($("#inqReplyNoteInput")) $("#inqReplyNoteInput").value = "";
    }

    $("#inquiryModal")?.classList.add("open");
  }

  // Secure link to customer_confirmation.html for an inquiry (id + token). Ensures a token exists.
  function buildInquiryConfirmationUrl(inq) {
    if (!inq) return "";
    if (!inq.confirmationToken && window.HS_CONFIG && window.HS_CONFIG.isApi) {
      return ""; // api mode: the backend issues the token (and the link) when the confirmation email is sent
    }
    if (!inq.confirmationToken) {
      inq.confirmationToken = "token_" + inq.id.toLowerCase().replace(/[^a-z0-9]/g, '') + "_" + (inq.email ? inq.email.split('@')[0].replace(/[^a-z0-9]/g, '').slice(0, 4) : 'sec') + '9a';
      if (db.save) db.save();
    }
    try {
      const pageUrl = new URL("customer_confirmation.html", window.location.href);
      pageUrl.searchParams.set("id", inq.id);
      if (inq.confirmationToken) pageUrl.searchParams.set("token", inq.confirmationToken);
      return pageUrl.toString();
    } catch (e) {
      return `customer_confirmation.html?id=${encodeURIComponent(inq.id)}&token=${encodeURIComponent(inq.confirmationToken || "")}`;
    }
  }

  function readInquiryConfirmationMessage() {
    const input = $("#inqConfirmationMessageInput");
    if (!input) return undefined;
    const text = input.value.trim();
    input.classList.toggle("input-error", !text);
    $("#errInqConfirmationMessage")?.classList.toggle("visible", !text);
    if (!text) {
      input.focus();
      showToast("Please enter the message to send with the confirmation link.", "danger", "⚠");
      return null;
    }
    return text;
  }

  function saveInquiryConfirmationMessageAction() {
    const inqId = $("#inqModalId")?.value || state.selectedInquiryId;
    if (!inqId || !db.saveInquiryConfirmationMessage) return;
    const message = readInquiryConfirmationMessage();
    if (message === null) return;
    const res = db.saveInquiryConfirmationMessage(inqId, message, "ADMIN (Limuel)");
    if (!res || !res.success) {
      showToast(res?.error || "Could not save the message.", "danger", "⚠");
      return;
    }
    showToast(`Confirmation message saved for ${inqId}`, "success", "✓");
    openInquiryModal(inqId);
  }

  function sendInquiryConfirmationEmailAction() {
    const inqId = $("#inqModalId")?.value || state.selectedInquiryId;
    if (!inqId) return;
    const message = readInquiryConfirmationMessage();
    if (message === null) return;
    const inq = (db.getInquiries ? db.getInquiries() : []).find(i => i.id === inqId);
    const res = db.sendInquiryConfirmationEmail(inqId, "ADMIN (Limuel)", message, { confirmationUrl: buildInquiryConfirmationUrl(inq) });
    if (res && res.success) {
      showToast(`Confirmation email sent to ${res.inquiry.email}`, "success", "✉");
      openInquiryModal(inqId);
      renderInquiries();
      updateBadgesAndKPIs();
    } else if (res && res.error) {
      showToast(res.error, "danger", "⚠");
    }
  }

  function copyConfirmationLinkAction() {
    const input = $("#inqConfirmationLinkInput");
    const url = input ? input.value : "";
    if (!url) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showToast("Confirmation link copied to clipboard", "success", "📋");
      }).catch(() => {
        input.select();
        showToast("Confirmation link selected", "neutral", "📋");
      });
    } else {
      input.select();
      showToast("Confirmation link selected", "neutral", "📋");
    }
  }

  function customerSimulateResponseAction(decision) {
    const inqId = $("#inqModalId")?.value || state.selectedInquiryId;
    if (!inqId) return;
    const inq = db.updateInquiryCustomerResponse(inqId, decision, "CUSTOMER (Simulated)");
    if (inq) {
      const isProceed = decision === "Proceed" || decision === "Proceed with Application";
      showToast(
        isProceed
          ? `Customer response received: Proceed with Application. Create Customer Account enabled.`
          : `Customer response received: Not Proceeding.`,
        isProceed ? "success" : "warn",
        isProceed ? "✓" : "ℹ"
      );
      openInquiryModal(inqId);
      renderInquiries();
      updateBadgesAndKPIs();
    }
  }

  function markInquiryRepliedAction() {
    const inqId = $("#inqModalId")?.value || state.selectedInquiryId;
    if (!inqId) return;

    const note = $("#inqReplyNoteInput")?.value?.trim() || "Addressed and replied via customer relations channel.";
    const updated = db.replyInquiry(inqId, note, "ADMIN (Limuel)");

    if (updated) {
      showToast(`Inquiry ${inqId} marked as Replied`, "success", "✓");
      openInquiryModal(inqId);
      updateBadgesAndKPIs();
      renderInquiries();
      if (typeof renderOverview === "function") renderOverview();
    }
  }

  function markInquiryUnreadAction() {
    const inqId = $("#inqModalId")?.value || state.selectedInquiryId;
    if (!inqId) return;

    const updated = db.updateInquiryStatus(inqId, "Unread", "", "ADMIN (Limuel)");
    if (updated) {
      showToast(`Inquiry ${inqId} marked as Unread`, "warn", "✉");
      openInquiryModal(inqId);
      updateBadgesAndKPIs();
      renderInquiries();
      if (typeof renderOverview === "function") renderOverview();
    }
  }

  function exportInquiriesAction() {
    const inquiries = db.getInquiries ? db.getInquiries() : [];
    if (!inquiries.length) {
      showToast("No inquiries to export", "warn", "ℹ");
      return;
    }

    const headers = [
      "Inquiry ID", "Customer Name", "Email", "Phone", "Location", "Category",
      "Selected Solar Model", "Electric Bill", "Payment Preference", "Message Status",
      "Customer Response", "Subject", "Submitted", "Reply Note"
    ];
    const rows = inquiries.map(i => {
      // Partner inquiries: partner category + partner status; no customer-only payment/response values
      const isPartner = !!(db.isPartnerInquiry && db.isPartnerInquiry(i));
      return [
      i.id,
      `"${(i.name || "").replace(/"/g, '""')}"`,
      `"${(i.email || "").replace(/"/g, '""')}"`,
      `"${(i.phone || "").replace(/"/g, '""')}"`,
      `"${(i.location || "").replace(/"/g, '""')}"`,
      `"${((isPartner ? partnerTypeLabel(i) : i.category) || "").replace(/"/g, '""')}"`,
      `"${(i.selectedSolarModel || i.package || "").replace(/"/g, '""')}"`,
      `"${(i.electricBill || "").replace(/"/g, '""')}"`,
      `"${(isPartner ? "" : (i.paymentPreference || "Full Payment")).replace(/"/g, '""')}"`,
      i.status,
      `"${(isPartner ? partnerInquiryStatusLabel(i) : (i.customerResponse || "Awaiting Response")).replace(/"/g, '""')}"`,
      `"${(i.subject || "").replace(/"/g, '""')}"`,
      `"${i.submitted || i.timestamp || ""}"`,
      `"${(i.reply?.replyNote || "").replace(/"/g, '""')}"`
    ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hello_solar_contact_inquiries_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast("Contact inquiries exported to CSV", "success", "📥");
  }

  // ==================== 6C. CREATE ACCOUNT PAGE ====================
  function prefillInquiry(id) {
    const inquiry = db.getInquiries().find(i => i.id === id);
    if (!inquiry || inquiry.customerId) return;
    const words = (inquiry.name || '').trim().split(/\s+/);
    const lastName = inquiry.lastName || (words.length > 1 ? words.pop() : '');
    const values = {
      newAccFirstName: inquiry.firstName || words.join(' '),
      newAccLastName: lastName, newAccEmail: inquiry.email, newAccPhone: inquiry.phone,
      newAccLocation: inquiry.address || inquiry.location,
      newAccSystem: inquiry.selectedSolarModel || inquiry.purchasedModel || inquiry.package,
      newAccProjectType: inquiry.projectType || (/Residential Solar|Commercial Solar|Battery Storage/.test(inquiry.category) ? inquiry.category : ''),
      newAccPaymentType: inquiry.paymentPreference === 'Not specified' ? '' : (inquiry.paymentPreference || inquiry.paymentType || ''),
      newAccTerm: String([6, 36, 72].includes(Number(inquiry.termMonths)) ? Number(inquiry.termMonths) : 72),
      newAccNotes: [inquiry.subject, inquiry.message].filter(Boolean).join('\n\n')
    };
    Object.entries(values).forEach(([field, value]) => {
      const input = document.getElementById(field);
      if (!input) return;
      if (input.tagName === 'SELECT' && value && ![...input.options].some(o => o.value === value)) input.add(new Option(value, value));
      input.value = value || '';
    });
    const inqSelect = document.getElementById('newAccInquiry');
    if (inqSelect) inqSelect.value = id;
    // Installment Term row follows the prefilled payment type
    const termWrap = document.getElementById('newAccTermWrap');
    const payType = document.getElementById('newAccPaymentType');
    if (termWrap) termWrap.style.display = payType && payType.value === 'Installment' ? '' : 'none';
  }
  // Installment Term shows only for Installment (Full Payment has no term)
  function syncNewAccTerm() {
    const wrap = document.getElementById('newAccTermWrap');
    if (wrap) wrap.style.display = ($('#newAccPaymentType')?.value === 'Installment') ? '' : 'none';
  }

  function renderCreateAccount() {
    const role = state.createAccountRole || "Customer";

    // 1. Sync Role Selector Tabs
    $$("#createAccountRoleTabs [data-role]").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.role === role);
    });

    // 2. Sync Role Dropdown
    const roleSelect = $("#newAccRole");
    if (roleSelect && roleSelect.value !== role) {
      roleSelect.value = role;
    }

    // 3. Update Headings & Description
    const titleEl = $("#createAccCardTitle");
    const descEl = $("#createAccCardDesc");
    const sectionTitleEl = $("#businessSectionTitle");

    const roleConfigs = {
      Customer: {
        title: "Create Customer Account",
        badge: "Customer Portal",
        desc: "Creates the customer, their application (APP ID) and HS ID in one step.",
        sectionTitle: "Hello Solar Project"
      },
      Installer: {
        title: "Create Installer Account",
        badge: "Installer Portal",
        desc: "Partner installer login for job dispatch and installation updates.",
        sectionTitle: "Company & Service Area"
      },
      Financer: {
        title: "Create Financer Account",
        badge: "Financer Portal",
        desc: "Financing partner login for credit review and repayments.",
        sectionTitle: "Institution & Program"
      },
      Merchant: {
        title: "Create Merchant Account",
        badge: "Merchant Portal",
        desc: "Supplier login for equipment orders and inventory.",
        sectionTitle: "Business & Supply Category"
      },
      Engineer: {
        title: "Create Installation Engineer",
        badge: "Hello Solar Installation",
        desc: "",
        sectionTitle: "Engineer Details"
      },
      Accounting: {
        title: "Create Accounting Account",
        badge: "Accounting",
        desc: "This account signs in to Super Admin and sees only the Accounting page.",
        sectionTitle: "Accounting Access"
      }
    };

    const cfg = roleConfigs[role] || roleConfigs.Customer;

    if (titleEl) {
      titleEl.innerHTML = `
        <span>${cfg.title}</span>
        <span class="status-pill warn" id="createAccRoleBadge" style="font-size:11px; font-weight:700;">${cfg.badge}</span>
      `;
    }
    if (descEl) {
      descEl.textContent = cfg.desc;
      descEl.style.display = cfg.desc ? "" : "none";
    }
    if (sectionTitleEl) sectionTitleEl.textContent = cfg.sectionTitle;

    // Direct Installation Engineer form: role & status are automatic (not shown); no admin note
    const isEngineerForm = role === "Engineer";
    // Account Role & Initial Status are internal (role = selected tab, status = Active) and never shown.
    if ($("#createAccRoleStatusRow")) $("#createAccRoleStatusRow").style.display = "none";
    if ($("#createAccNotesRow")) $("#createAccNotesRow").style.display = isEngineerForm ? "none" : "";

    // Toggle customer activation notice vs password row
    const custNotice = $("#customerActivationNotice");
    const nonCustPass = $("#nonCustomerPasswordRow");
    if (role === "Customer") {
      if (custNotice) custNotice.style.display = "block";
      if (nonCustPass) nonCustPass.style.display = "none";
    } else {
      if (custNotice) custNotice.style.display = "none";
      if (nonCustPass) nonCustPass.style.display = "block";
    }

    // 4. Render Dynamic Role Fields
    const grid = $("#dynamicRoleFieldsGrid");
    if (!grid) return;
    if (grid.dataset.role === 'Customer') {
      state.customerProjectDraft = Object.fromEntries([...grid.querySelectorAll('input, select')].map(input => [input.id, input.value]));
    }
    grid.dataset.role = role;

    if (role === "Customer") {
      state.projectIds ||= db.generateProjectIds();
      grid.innerHTML = `
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccApplicationId">Application ID</label>
          <input class="input-field sa-readonly" id="newAccApplicationId" value="${safeText(state.projectIds.appId)}" readonly style="width:100%;" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccHsId">HS ID</label>
          <input class="input-field sa-readonly" id="newAccHsId" value="${safeText(state.projectIds.hsId)}" readonly style="width:100%;" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccSystemStatus">System Status</label>
          <input class="input-field sa-readonly" id="newAccSystemStatus" value="Waiting for Installer" readonly style="width:100%;" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccInquiry">Linked Inquiry</label>
          <select class="input-field" id="newAccInquiry" style="width:100%;">
            <option value="">None (direct registration)</option>
            ${db.getInquiries().filter(i => !i.customerId && !(db.isPartnerInquiry && db.isPartnerInquiry(i))).map(i => `<option value="${safeText(i.id)}" ${i.id === state.createInquiryId ? 'selected' : ''}>${safeText(i.id)} · ${safeText(i.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccProjectType">Project Type <span style="color:var(--primary);">*</span></label>
          <select class="input-field" id="newAccProjectType" style="width:100%;">
            <option value="">Select project type</option>
            <option>Residential Solar</option><option>Commercial Solar</option><option>Battery Storage</option><option>Custom Solar Installation</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccPaymentType">Payment Type</label>
          <select class="input-field" id="newAccPaymentType" style="width:100%;">
            <option value="">Select payment type</option>
            <option value="Full Payment">Full Payment</option>
            <option value="Installment">Installment</option>
          </select>
        </div>
        <div class="form-group" id="newAccTermWrap" style="margin-bottom:0; display:none;">
          <label class="form-label" for="newAccTerm">Installment Term</label>
          <select class="input-field" id="newAccTerm" style="width:100%;">
            ${installmentTermOptions().map(t => `<option value="${t}" ${t === 72 ? "selected" : ""}>${safeText(termText(t))}</option>`).join("")}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccSystem">Solar Model <span style="color:var(--primary);">*</span></label>
          <select class="input-field" id="newAccSystem" style="width:100%;">
            <option value="">Select model</option>
            ${[...new Set(db.getInquiries().map(i => i.selectedSolarModel || i.package).filter(p => p && !/partner/i.test(p)))].map(p => `<option>${safeText(p)}</option>`).join('')}
            <option value="6 kW Residential">6 kW Residential System</option>
            <option value="8 kW Residential">8 kW Residential System</option>
            <option value="10 kW Residential">10 kW Residential System</option>
            <option value="12 kW Commercial">12 kW Commercial System</option>
            <option value="18 kW Commercial">18 kW Commercial System</option>
            <option value="Custom Solar Installation">Custom Solar Installation</option>
            <option value="Pending Assessment">Pending Assessment</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccLocation">Installation Location</label>
          <input type="text" class="input-field" id="newAccLocation" placeholder="e.g. Cebu City, Mandaue City" style="width:100%;" />
        </div>
      `;
      $('#newAccPaymentType')?.addEventListener('change', syncNewAccTerm);
      syncNewAccTerm();
      $('#newAccInquiry').addEventListener('change', e => {
        state.createInquiryId = e.target.value || null;
        if (state.createInquiryId) prefillInquiry(state.createInquiryId);
      });
      if (state.customerProjectDraft) {
        Object.entries(state.customerProjectDraft).forEach(([id, value]) => {
          const input = document.getElementById(id);
          if (!input) return;
          if (input.tagName === 'SELECT' && value && ![...input.options].some(o => o.value === value)) input.add(new Option(value, value));
          input.value = value;
        });
        syncNewAccTerm();
      } else if (state.createInquiryId) prefillInquiry(state.createInquiryId);
    } else if (role === "Installer") {
      grid.innerHTML = `
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccCompany">Company Name <span style="color:var(--primary);">*</span></label>
          <input type="text" class="input-field" id="newAccCompany" placeholder="e.g. SolarTech Visayas Solutions" style="width:100%;" required />
          <div class="form-error" id="errNewAccCompany">Company name is required.</div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccInstallerType">Installer Type</label>
          <select class="input-field" id="newAccInstallerType" style="width:100%;">
            <option value="Partner" selected>Partner Installer</option>
            <option value="Internal">Hello Solar Installation</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0; grid-column:1 / -1;">
          <label class="form-label" for="newAccLocation">Service Area</label>
          <input type="text" class="input-field" id="newAccLocation" placeholder="e.g. Metro Cebu, Region VII, Central Visayas" style="width:100%;" />
        </div>
      `;
    } else if (role === "Financer") {
      grid.innerHTML = `
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccCompany">Institution Name <span style="color:var(--primary);">*</span></label>
          <input type="text" class="input-field" id="newAccCompany" placeholder="e.g. SunFund Philippines" style="width:100%;" required />
          <div class="form-error" id="errNewAccCompany">Institution name is required.</div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccCategory">Financing Program</label>
          <select class="input-field" id="newAccCategory" style="width:100%;">
            <option value="Green Energy Solar Loan" selected>Green Energy Solar Loan</option>
            <option value="Commercial Asset Financing">Commercial Asset Financing</option>
            <option value="Zero Cash-Out Financing">Zero Cash-Out Financing</option>
            <option value="Digital Solar Microloan">Digital Solar Microloan</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0; grid-column:1 / -1;">
          <label class="form-label" for="newAccLocation">Office Location</label>
          <input type="text" class="input-field" id="newAccLocation" placeholder="e.g. BGC, Taguig City / Cebu Business Park" style="width:100%;" />
        </div>
      `;
    } else if (role === "Engineer") {
      grid.innerHTML = `
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccEngineerId">Engineer ID</label>
          <input type="text" class="input-field" id="newAccEngineerId" value="${safeText(db.getNextEngineerId())}" readonly style="width:100%;" />
          <div class="form-error" id="errNewAccEngineerId">Engineer ID must follow the format ENG-001.</div>
        </div>
      `;
    } else if (role === "Accounting") {
      grid.innerHTML = `
        <div class="form-group" style="margin-bottom:0; grid-column:1 / -1;">
          <label class="form-label" for="newAccAccess">Portal Access</label>
          <input type="text" class="input-field sa-readonly" id="newAccAccess" value="Accounting page only" readonly style="width:100%;" />
        </div>
      `;
    } else if (role === "Merchant") {
      grid.innerHTML = `
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccCompany">Business Name <span style="color:var(--primary);">*</span></label>
          <input type="text" class="input-field" id="newAccCompany" placeholder="e.g. SolarHub Trading" style="width:100%;" required />
          <div class="form-error" id="errNewAccCompany">Merchant name is required.</div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="newAccCategory">Product Category</label>
          <select class="input-field" id="newAccCategory" style="width:100%;">
            <option value="Solar Equipment & PV Modules" selected>Solar Equipment &amp; PV Modules</option>
            <option value="Inverters & Battery Storage">Inverters &amp; Battery Storage</option>
            <option value="Mounting & Electrical Hardware">Mounting &amp; Electrical Hardware</option>
            <option value="Turnkey Balance of System (BoS)">Turnkey Balance of System (BoS)</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0; grid-column:1 / -1;">
          <label class="form-label" for="newAccLocation">Store / Warehouse</label>
          <input type="text" class="input-field" id="newAccLocation" placeholder="e.g. Mandaue City, Cebu / North Reclamation Area" style="width:100%;" />
        </div>
      `;
    }
  }

  function handleCreateAccountSubmit(e) {
    if (e) e.preventDefault();

    const role = state.createAccountRole || "Customer";
    const firstName = ($("#newAccFirstName")?.value || "").trim();
    const lastName = ($("#newAccLastName")?.value || "").trim();
    const email = ($("#newAccEmail")?.value || "").trim();
    const phone = ($("#newAccPhone")?.value || "").trim();
    const password = ($("#newAccPassword")?.value || "").trim();
    const status = role === "Engineer" ? "Pending Activation" : ($("#newAccStatus")?.value || "Active");
    const company = ($("#newAccCompany")?.value || "").trim();
    const location = ($("#newAccLocation")?.value || "").trim();
    const system = $("#newAccSystem")?.value || "";
    const paymentType = $("#newAccPaymentType")?.value || "";
    const termMonths = paymentType === "Installment" ? (Number($("#newAccTerm")?.value) || null) : null;
    const installerType = $("#newAccInstallerType")?.value || "Partner";
    const category = $("#newAccCategory")?.value || "";
    const notes = role === "Engineer" ? "" : ($("#newAccNotes")?.value || "").trim();

    // Clear previous errors
    $$("#createAccountForm .form-error").forEach(err => err.classList.remove("visible"));
    $$("#createAccountForm .input-field").forEach(inp => inp.classList.remove("input-error"));

    let hasError = false;

    if (!firstName) {
      $("#newAccFirstName")?.classList.add("input-error");
      $("#errNewAccFirstName")?.classList.add("visible");
      hasError = true;
    }
    if (!lastName) {
      $("#newAccLastName")?.classList.add("input-error");
      $("#errNewAccLastName")?.classList.add("visible");
      hasError = true;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      $("#newAccEmail")?.classList.add("input-error");
      $("#errNewAccEmail")?.classList.add("visible");
      hasError = true;
    }
    if (!phone) {
      $("#newAccPhone")?.classList.add("input-error");
      $("#errNewAccPhone")?.classList.add("visible");
      hasError = true;
    }
    if (role !== "Customer" && (!password || password.length < 6)) {
      $("#newAccPassword")?.classList.add("input-error");
      $("#errNewAccPassword")?.classList.add("visible");
      hasError = true;
    }
    const engineerId = ($("#newAccEngineerId")?.value || "").trim().toUpperCase();
    if (role === "Engineer" && !/^ENG-\d{3,}$/.test(engineerId)) {
      $("#newAccEngineerId")?.classList.add("input-error");
      $("#errNewAccEngineerId")?.classList.add("visible");
      hasError = true;
    }
    if (role !== "Customer" && role !== "Engineer" && role !== "Accounting" && !company) {
      $("#newAccCompany")?.classList.add("input-error");
      $("#errNewAccCompany")?.classList.add("visible");
      hasError = true;
    }

    if (hasError) {
      showToast("Please complete all required fields correctly.", "danger", "⚠");
      return;
    }

    const customerPassword = password || "Solar2026!Pass";
    const invitationStatus = role === "Customer" ? (status === "Pending Activation" ? "Pending Activation" : "Sent") : "Active";

    // Call store method
    const res = db.createAccount({
      role,
      firstName,
      lastName,
      email,
      phone,
      password: role === "Customer" ? customerPassword : password,
      status,
      invitationStatus,
      companyName: company,
      location,
      system,
      paymentType,
      termMonths,
      installerType,
      category,
      notes,
      inquiryId: role === 'Customer' ? state.createInquiryId : null,
      // Partner inquiry link applies only when creating the inquiry's own partner type
      // (untyped inquiries link to whichever partner role Super Admin picks)
      partnerInquiryId: state.createPartnerInquiryId && (state.createPartnerInquiryRole ? role === state.createPartnerInquiryRole : ["Financer", "Installer", "Merchant"].includes(role)) ? state.createPartnerInquiryId : null,
      appId: state.projectIds?.appId,
      hsId: state.projectIds?.hsId,
      projectType: $('#newAccProjectType')?.value || '',
      engineerId: role === "Engineer" ? engineerId : undefined
    });

    if (!res || !res.success) {
      showToast(res?.error || "Failed to create account. Please try again.", "danger", "⚠");
      return;
    }

    state.lastCreatedAccountTab = res.tabKey;
    if (res.account?.partnerInquiryId) {
      state.createPartnerInquiryId = null;
      state.createPartnerInquiryRole = null;
      updateBadgesAndKPIs();
    }

    // Toast notification
    const roleLabel = role === "Engineer" ? "Installation Engineer" : role;
    showToast(role === "Customer"
      ? `Customer account ${res.id} created · Pending Activation`
      : `${roleLabel} account ${res.id} created`, "success", "✓");

    // Success Card
    const card = $("#createAccSuccessCard");
    const msgEl = $("#createAccSuccessMsg");
    const idEl = $("#createAccSuccessId");
    const activationBox = $("#createAccActivationBox");
    const activationInput = $("#createAccActivationLinkInput");
    const inviteBadge = $("#createAccInvitationStatusBadge");

    if (idEl) idEl.textContent = res.id;
    if (msgEl) {
      const acc = res.account || {};
      const name = safeText(`${firstName} ${lastName}`.trim() || acc.name || '');
      const mail = safeText(acc.email || email);
      if (role === 'Customer') {
        msgEl.innerHTML = `<strong>${name}</strong> · ${safeText(acc.appId || '')} · ${safeText(acc.hsId || '')}<br>` +
          `Account is <strong>Pending Activation</strong> for <strong>${mail}</strong>. The project is now <em>Waiting for Installer</em>.`;
      } else if (role === 'Engineer') {
        msgEl.innerHTML = `<strong>${name}</strong> · ${roleLabel}<br>` +
          `Status: <strong>Pending Activation</strong>. Activate it in Portal Accounts &gt; Engineers, then the engineer signs in with <strong>${mail}</strong> or ${safeText(acc.id || res.id)} and the temporary password.`;
      } else {
        msgEl.innerHTML = `<strong>${name}</strong>${company ? ` · ${safeText(company)}` : ''} · ${roleLabel} Portal<br>` +
          `Sign-in: <strong>${mail}</strong> with the temporary password. Share it securely and ask them to change it after first sign-in.`;
      }
    }

    if (role === 'Customer') {
      if (activationBox) activationBox.style.display = 'block';
      const actLink = res.account?.activationLink || res.activationLink || `https://portal.hellosolar.ph/activate?token=act_${res.id}&id=${res.id}&email=${encodeURIComponent(res.account.email)}`;
      if (activationInput) activationInput.value = actLink;
      if (inviteBadge) {
        const invStat = res.account?.invitationStatus || 'Sent';
        inviteBadge.textContent = invStat === 'Active' ? 'Active' : 'Pending Activation';
        inviteBadge.className = `status-pill ${invStat === 'Active' ? 'success' : 'warn'}`;
      }
      state.lastCreatedCustomerId = res.id;
      renderActivationEmailState(res.account);
    } else {
      if (activationBox) activationBox.style.display = 'none';
    }

    if (card) {
      card.style.display = "block";
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // Update Directory & Badges
    renderAccounts();
    renderApplications();
    updateBadgesAndKPIs();
    $('#btnSubmitCreateAccount').disabled = true;
  }

  // Activation email: no email service yet, so the email (with the internal activation link) is
  // prepared and queued for backend delivery. The UI never claims it was delivered.
  function renderActivationEmailState(account) {
    const note = $("#createAccActivationNote");
    const btn = $("#btnSendActivationEmail");
    const queued = account?.activationEmail;
    if (note) {
      note.textContent = queued
        ? `Activation email queued for ${account.email} · waiting for the email service to deliver it.`
        : "The customer activates the account and sets a password from the activation email.";
    }
    if (btn) btn.textContent = queued ? "Queue Again" : "Send Activation Email";
  }

  function sendActivationEmailAction() {
    const customerId = state.lastCreatedCustomerId;
    if (!customerId || typeof db.queueActivationEmail !== "function") return;
    const res = db.queueActivationEmail(customerId, SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)");
    if (!res.success) {
      showToast(res.error || "Could not prepare the activation email.", "danger", "⚠");
      return;
    }
    renderActivationEmailState(res.customer);
    showToast(`Activation email queued for ${res.customer.email}. Delivery starts once the email service is connected.`, "neutral", "✉");
  }

  function resetCreateAccountForm() {
    state.createInquiryId = null;
    state.createPartnerInquiryId = null;
    state.createPartnerInquiryRole = null;
    state.projectIds = null;
    state.customerProjectDraft = null;
    $('#dynamicRoleFieldsGrid').dataset.role = '';
    $('#btnSubmitCreateAccount').disabled = false;
    const form = $("#createAccountForm");
    if (form) form.reset();
    $$("#createAccountForm .form-error").forEach(err => err.classList.remove("visible"));
    $$("#createAccountForm .input-field").forEach(inp => inp.classList.remove("input-error"));

    const passInput = $("#newAccPassword");
    if (passInput) {
      passInput.value = "Solar2026!Pass";
      passInput.type = "password";
      updatePasswordVisibilityIcon();
    }

    const statusInput = $("#newAccStatus");
    if (statusInput) statusInput.value = "Active";

    const successCard = $("#createAccSuccessCard");
    if (successCard) successCard.style.display = "none";

    renderCreateAccount();
  }

  function updatePasswordVisibilityIcon() {
    const passInput = $("#newAccPassword");
    const btn = $("#btnTogglePasswordVisibility");
    if (!btn || !passInput) return;

    const isPassword = passInput.type === "password";
    if (isPassword) {
      // Hidden behind dots -> Click to reveal password -> Simple clean eye icon
      btn.innerHTML = `
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `;
      btn.setAttribute("title", "Show password");
      btn.setAttribute("aria-label", "Show password");
    } else {
      // Visible in plain text -> Click to hide password -> Simple clean eye-off icon
      btn.innerHTML = `
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      `;
      btn.setAttribute("title", "Hide password");
      btn.setAttribute("aria-label", "Hide password");
    }
  }

  function generateRandomPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let randomPart = "";
    for (let i = 0; i < 6; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const pass = `HS#${randomPart}26!`;
    const passInput = $("#newAccPassword");
    if (passInput) {
      passInput.value = pass;
      passInput.type = "text";
      updatePasswordVisibilityIcon();
      showToast("Generated new temporary password", "success", "⚡");
    }
  }

  // ==================== 7. ACTIVITY PAGE ====================
  function renderActivity() {
    const activity = db.data.activity;

    const filtered = activity.filter(a => {
      const matchRole = state.activityRoleFilter === "All" ||
        (a.role && a.role.toLowerCase() === state.activityRoleFilter.toLowerCase());

      const q = state.activitySearchQuery.toLowerCase().trim();
      const matchSearch = !q || (
        (a.action && a.action.toLowerCase().includes(q)) ||
        (a.user && a.user.toLowerCase().includes(q)) ||
        (a.actorId && a.actorId.toLowerCase().includes(q)) ||
        (a.record && a.record.toLowerCase().includes(q)) ||
        (a.id && a.id.toLowerCase().includes(q)) ||
        (a.role && a.role.toLowerCase().includes(q)) ||
        (a.recordType && a.recordType.toLowerCase().includes(q))
      );

      const matchDate = matchActivityDate(a.timestamp, state.activityDateFilter);
      return matchRole && matchSearch && matchDate;
    });

    const tbody = $("#activityTableBody");
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:36px 16px; color:var(--muted);">
            <div style="font-size:24px; margin-bottom:6px;">📋</div>
            <div style="font-weight:600; color:var(--ink); font-size:13.5px;">No activity logs found</div>
            <div style="font-size:12px; margin-top:4px;">No audit records match the current search query or filter selection.</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(a => {
      // Use exact activity timestamp as the single authoritative source of truth
      const exactTime = a.exactTime || formatExactTimestamp(a.timestamp);
      const sourceTime = a.timestamp || a.exactTime;
      const relTime = calculateRelativeTime(sourceTime);
      const isoTime = a.timestamp || "";
      const hasRecord = a.record && a.record !== "-" && a.record !== "None";

      // If dynamic relative time cannot be reliably calculated, prefer displaying only the exact timestamp rather than showing an incorrect relative label.
      const timeCellContent = relTime !== null
        ? `
            <div class="activity-rel-time" data-timestamp="${a.timestamp || ''}" data-exact="${exactTime}" style="font-weight:600; font-size:12.5px; color:var(--ink);">${relTime}</div>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;" title="${isoTime ? `${isoTime} · Event ID: ${a.id}` : exactTime}">${exactTime}</div>
          `
        : `
            <div style="font-weight:600; font-size:12.5px; color:var(--ink);" title="${isoTime ? `${isoTime} · Event ID: ${a.id}` : exactTime}">${exactTime}</div>
          `;

      return `
        <tr>
          <td style="white-space: nowrap;">
            ${timeCellContent}
          </td>
          <td>
            <strong style="display:block; font-size:12.5px; color:var(--ink); line-height:1.3;">${a.user || a.role}</strong>
            <span class="sub-info" style="margin:0; font-size:11px;">${a.role}${a.actorId ? ` · <span style="font-family:monospace; font-size:10.5px;">${a.actorId}</span>` : ''}</span>
          </td>
          <td>
            <div style="font-size:12.5px; color:var(--ink); line-height:1.45;">${a.action}</div>
          </td>
          <td>
            ${hasRecord ? `
              <button type="button" class="record-tag-btn" data-open-record="${a.record}" title="Open related ${a.recordType || 'record'} ${a.record}">
                <span>${a.record}</span>
                <span class="tag-arrow" style="font-size:10px; margin-left:2px; opacity:0.75;">↗</span>
              </button>
            ` : `<span class="sub-info" style="color:var(--muted);">—</span>`}
          </td>
        </tr>
      `;
    }).join("");
  }

  // Refresh relative-time labels dynamically and periodically so they do not become stale while the page remains open
  function refreshDynamicRelativeTimes() {
    // 1. Refresh Activity table relative time labels in-place without rebuilding DOM or resetting focus/scroll
    const activityRelEls = $$("#activityTableBody .activity-rel-time");
    activityRelEls.forEach(el => {
      const source = el.dataset.timestamp || el.dataset.exact;
      if (!source) return;
      const freshRel = calculateRelativeTime(source);
      if (freshRel !== null) {
        if (el.textContent !== freshRel) {
          el.textContent = freshRel;
        }
      } else {
        // If relative time can no longer be reliably calculated, display only the exact timestamp
        const exact = el.dataset.exact || formatExactTimestamp(source);
        const parentTd = el.closest("td");
        if (parentTd) {
          parentTd.innerHTML = `<div style="font-weight:600; font-size:12.5px; color:var(--ink);">${exact}</div>`;
        }
      }
    });

    // 2. Refresh Overview activity relative time labels
    const overviewRelEls = $$("#overviewActivityList .overview-rel-time");
    overviewRelEls.forEach(el => {
      const source = el.dataset.timestamp || el.dataset.exact;
      if (!source) return;
      const freshRel = calculateRelativeTime(source);
      const exact = el.dataset.exact || formatExactTimestamp(source);
      if (freshRel !== null) {
        const newText = `${freshRel} · ${exact}`;
        if (el.textContent !== newText) {
          el.textContent = newText;
        }
      } else {
        el.textContent = exact;
      }
    });
  }

  // Periodically refresh relative time labels (every 30 seconds) so they never become stale
  setInterval(refreshDynamicRelativeTimes, 30000);

  // Environment mode detection: Developer/Demo tools available ONLY in dev/demo mode
  function isDevOrDemoMode() {
    if (typeof window === "undefined") return false;
    if (window.HELLO_SOLAR_DEV_MODE === true || window.HELLO_SOLAR_DEMO_MODE === true) return true;
    try {
      if (window.location) {
        const search = window.location.search || "";
        const params = new URLSearchParams(search);
        if (params.get("env") === "prod" || params.get("env") === "production") return false;
        if (params.get("dev") === "true" || params.get("demo") === "true") return true;

        const hostname = window.location.hostname || "";
        const protocol = window.location.protocol || "";
        if (protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local") || hostname.includes("preview")) {
          return true;
        }
      }
    } catch (_) { }
    return false;
  }

  // Safe setter for controlled select dropdowns
  function setSelectValueSafely(selectEl, desiredValue, fallbackValue) {
    if (!selectEl) return;
    const val = desiredValue || fallbackValue;
    const hasOption = Array.from(selectEl.options).some(o => o.value === val);
    if (hasOption) {
      selectEl.value = val;
    } else if (val) {
      const opt = new Option(val, val, true, true);
      selectEl.add(opt);
      selectEl.value = val;
    } else {
      selectEl.value = fallbackValue;
    }
  }

  // Settings validation helper: validates all fields, returns errors map & parsed values
  function validateSettingsForm() {
    const errors = {};

    const companyName = $("#setCompanyName")?.value.trim() || "";
    if (!companyName) {
      errors.setCompanyName = "Platform name is required.";
    }

    const timezone = $("#setTimezone")?.value || "";
    if (!timezone) {
      errors.setTimezone = "Please select an operational timezone.";
    }

    const currency = $("#setCurrency")?.value || "";
    if (!currency) {
      errors.setCurrency = "Please select a default currency.";
    }

    const email = $("#setEmail")?.value.trim() || "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      errors.setEmail = "Please enter a valid email address (e.g., admin@hellosolar.ph).";
    }

    const directTeam = $("#setDirectTeam")?.value.trim() || "";
    if (!directTeam) {
      errors.setDirectTeam = "Designated internal engineering unit is required.";
    }

    // Maximum Concurrent Direct Projects: positive whole numbers only (integer >= 1)
    const maxDirectRaw = $("#setMaxDirect")?.value.trim() || "";
    if (!/^\d+$/.test(maxDirectRaw) || parseInt(maxDirectRaw, 10) < 1) {
      errors.setMaxDirect = "Must be a positive whole number (at least 1).";
    }

    // Payment Overdue Days: valid non-negative numeric value (integer >= 0)
    const overdueRaw = $("#setOverdueDays")?.value.trim() || "";
    if (!/^\d+$/.test(overdueRaw) || parseInt(overdueRaw, 10) < 0) {
      errors.setOverdueDays = "Must be a non-negative whole number (0 or greater).";
    }

    // Installation Delay Days: valid non-negative numeric value (integer >= 0)
    const delayRaw = $("#setDelayDays")?.value.trim() || "";
    if (!/^\d+$/.test(delayRaw) || parseInt(delayRaw, 10) < 0) {
      errors.setDelayDays = "Must be a non-negative whole number (0 or greater).";
    }

    // Document Review Hours: valid non-negative numeric value (integer >= 0)
    const docHoursRaw = $("#setDocHours")?.value.trim() || "";
    if (!/^\d+$/.test(docHoursRaw) || parseInt(docHoursRaw, 10) < 0) {
      errors.setDocHours = "Must be a non-negative whole number (0 or greater).";
    }

    const currentValues = {
      companyName: companyName,
      timezone: timezone,
      currency: currency,
      contactEmail: email,
      directInstallTeam: directTeam,
      maxDirectProjects: parseInt(maxDirectRaw, 10),
      directInstallConfirmation: $("#setDirectConfirm")?.checked === true,
      overdueThresholdDays: parseInt(overdueRaw, 10),
      installationDelayThresholdDays: parseInt(delayRaw, 10),
      docReviewEscalationHours: parseInt(docHoursRaw, 10)
    };

    return {
      isValid: Object.keys(errors).length === 0,
      errors: errors,
      currentValues: currentValues
    };
  }

  // Display concise inline validation messages beside or below fields
  function renderInlineErrors(errors) {
    const fieldIds = [
      "setCompanyName", "setTimezone", "setCurrency", "setEmail",
      "setDirectTeam", "setMaxDirect", "setOverdueDays", "setDelayDays", "setDocHours"
    ];

    fieldIds.forEach(id => {
      const el = $(`#${id}`);
      const errEl = $(`#err${id.charAt(0).toUpperCase() + id.slice(1)}`);
      const msg = errors[id];

      if (msg) {
        if (el) el.classList.add("input-error");
        if (errEl) {
          errEl.textContent = msg;
          errEl.classList.add("visible");
        }
      } else {
        if (el) el.classList.remove("input-error");
        if (errEl) {
          errEl.textContent = "";
          errEl.classList.remove("visible");
        }
      }
    });
  }

  // Helper: Snapshot of current settings form inputs
  function getSettingsFormSnapshot() {
    const validation = validateSettingsForm();
    return validation.currentValues;
  }

  // Unambiguously disable Save Preferences button (no stale disabled state)
  function disableSaveButton() {
    const saveBtn = $("#btnSaveSettings");
    if (!saveBtn) return;
    saveBtn.disabled = true;
    saveBtn.setAttribute("disabled", "disabled");
    saveBtn.setAttribute("aria-disabled", "true");
    saveBtn.style.pointerEvents = "";
  }

  // Unambiguously enable Save Preferences button (fully clickable, pointer-events: auto)
  function enableSaveButton() {
    const saveBtn = $("#btnSaveSettings");
    if (!saveBtn) return;
    saveBtn.disabled = false;
    saveBtn.removeAttribute("disabled");
    saveBtn.setAttribute("aria-disabled", "false");
    saveBtn.style.pointerEvents = "auto";
  }

  // Check if settings form differs from saved values and toggle save button
  // Lifecycle:
  // 1. Initial load -> Disabled (no changes)
  // 2. Setting changed & valid -> Enabled
  // 3. Reverted to baseline -> Disabled
  // 4. Any field invalid -> Disabled + inline error
  // 5. Saved successfully -> Disabled + "Settings saved"
  function checkSettingsDirtyState() {
    const saveBtn = $("#btnSaveSettings");
    const statusEl = $("#settingsSaveStatus");
    if (!saveBtn) return;

    if (!state.savedSettingsSnapshot) {
      disableSaveButton();
      if (statusEl) statusEl.textContent = "";
      return;
    }

    const validation = validateSettingsForm();
    const current = validation.currentValues;
    const saved = state.savedSettingsSnapshot;

    // Compare form values with saved baseline
    let isDirty = false;
    for (const key of Object.keys(saved)) {
      if (current[key] !== saved[key]) {
        isDirty = true;
        break;
      }
    }

    if (!isDirty) {
      // 3. User changed all values back to original saved baseline
      disableSaveButton();
      renderInlineErrors({});
      if (statusEl && statusEl.textContent !== "Settings saved") {
        statusEl.textContent = "";
      }
    } else if (!validation.isValid) {
      // 4. At least one field is invalid: keep disabled and show inline errors
      disableSaveButton();
      renderInlineErrors(validation.errors);
      if (statusEl) {
        statusEl.textContent = "● Please correct invalid settings";
        statusEl.style.color = "var(--danger)";
      }
    } else {
      // 2. At least one value differs and all fields are valid: enable button
      enableSaveButton();
      renderInlineErrors({});
      if (statusEl) {
        statusEl.textContent = "● Unsaved changes";
        statusEl.style.color = "var(--warn, #c27a12)";
      }
    }
  }

  // ==================== 8. SETTINGS PAGE ====================
  function renderSettings() {
    const s = db.data.settings;
    if (!s) return;

    if ($("#setCompanyName")) $("#setCompanyName").value = s.companyName || "Hello Solar Philippines";
    setSelectValueSafely($("#setTimezone"), s.timezone, "Philippine Standard Time (GMT+8)");
    setSelectValueSafely($("#setCurrency"), s.currency, "PHP (₱)");
    if ($("#setEmail")) $("#setEmail").value = s.contactEmail || "admin@hellosolar.ph";
    if ($("#setDirectTeam")) $("#setDirectTeam").value = s.directInstallTeam || "Hello Solar Internal Team";
    if ($("#setMaxDirect")) $("#setMaxDirect").value = (s.maxDirectProjects !== undefined) ? s.maxDirectProjects : 12;
    if ($("#setDirectConfirm")) $("#setDirectConfirm").checked = s.directInstallConfirmation !== false;
    if ($("#setOverdueDays")) $("#setOverdueDays").value = (s.overdueThresholdDays !== undefined) ? s.overdueThresholdDays : 5;
    if ($("#setDelayDays")) $("#setDelayDays").value = (s.installationDelayThresholdDays !== undefined) ? s.installationDelayThresholdDays : 1;
    if ($("#setDocHours")) $("#setDocHours").value = (s.docReviewEscalationHours !== undefined) ? s.docReviewEscalationHours : 48;

    // Developer / Demo Tools visibility: hidden completely in production
    const devTools = $("#devToolsWrapper");
    if (devTools) {
      devTools.style.display = isDevOrDemoMode() ? "block" : "none";
    }

    // Clear any previous inline errors
    renderInlineErrors({});

    // 1. Store original/saved baseline on load
    const validation = validateSettingsForm();
    state.savedSettingsSnapshot = { ...validation.currentValues };

    // Initial state: Save Preferences must be disabled because no changes exist yet
    disableSaveButton();
    const statusEl = $("#settingsSaveStatus");
    if (statusEl) statusEl.textContent = "";
  }

  function saveSettings(e) {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }

    const saveBtn = $("#btnSaveSettings");
    const statusEl = $("#settingsSaveStatus");

    // 1. Validate form fields
    const validation = validateSettingsForm();
    renderInlineErrors(validation.errors);

    if (!validation.isValid) {
      if (statusEl) {
        statusEl.textContent = "● Please correct invalid settings";
        statusEl.style.color = "var(--danger)";
      }
      showToast("Please correct invalid settings before saving.", "danger", "⚠️");
      disableSaveButton();
      return;
    }

    try {
      const prev = { ...db.data.settings };
      const newSettings = { ...validation.currentValues };

      // Field labels for readable audit trail
      const fieldLabels = {
        companyName: "Platform Name",
        timezone: "Operational Timezone",
        currency: "Default Currency",
        contactEmail: "Alert / Escalation Email",
        directInstallTeam: "Designated Internal Engineering Unit",
        maxDirectProjects: "Maximum Concurrent Direct Projects",
        directInstallConfirmation: "Require Confirmation for Hello Solar Installation Acceptance",
        overdueThresholdDays: "Mark Payment Overdue After (Days)",
        installationDelayThresholdDays: "Mark Installation Delayed After (Days)",
        docReviewEscalationHours: "Flag Document Review After (Hours)"
      };

      const now = new Date();
      const exactTimeStr = typeof formatExactAuditTimestamp === "function"
        ? formatExactAuditTimestamp(now)
        : now.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

      // 2. Record every individual successful configuration change in Activity/Audit Log
      let changedCount = 0;
      for (const [key, label] of Object.entries(fieldLabels)) {
        const oldVal = prev[key];
        const newVal = newSettings[key];
        if (oldVal !== newVal) {
          changedCount++;
          db.logActivity(
            "Admin",
            "ADMIN (Limuel)",
            `ADMIN changed ${label} from "${oldVal}" to "${newVal}"`,
            "SETTINGS",
            {
              actorId: "ADMIN-01",
              recordType: "System Settings",
              timestamp: now.toISOString(),
              exactTime: exactTimeStr,
              details: {
                adminUser: "ADMIN (Limuel)",
                adminId: "ADMIN-01",
                field: key,
                fieldLabel: label,
                previousValue: oldVal,
                newValue: newVal,
                timestamp: now.toISOString(),
                exactTime: exactTimeStr
              }
            }
          );
        }
      }

      // 3. Persist updated values to centralized settings data/state/storage
      db.updateSettings(newSettings);

      // 4. Update saved baseline to the newly saved values
      state.savedSettingsSnapshot = { ...newSettings };

      // 5. Disable the button again until another setting changes
      disableSaveButton();
      renderInlineErrors({});

      // 6. Show small confirmation: "Settings saved"
      if (statusEl) {
        statusEl.textContent = "Settings saved";
        statusEl.style.color = "var(--success, #23835a)";
        setTimeout(() => {
          if (statusEl.textContent === "Settings saved") {
            statusEl.textContent = "";
          }
        }, 3500);
      }

      showToast("Settings saved", "success", "✓");

      // Refresh dynamic alert counters and KPIs if necessary
      if (typeof updateBadgesAndKPIs === "function") updateBadgesAndKPIs();
      if (typeof renderOverview === "function" && state.currentPage === "overview") renderOverview();
    } catch (err) {
      // 7. If saving fails: keep current unsaved values visible, show error, do not update baseline
      console.error("Save settings failure:", err);
      if (statusEl) {
        statusEl.textContent = "Failed to save settings";
        statusEl.style.color = "var(--danger)";
      }
      showToast("Failed to save settings: " + (err.message || "An error occurred"), "danger", "⚠️");
    }
  }

  // ==================== GLOBAL SEARCH ====================
  function handleGlobalSearch(e) {
    const q = e.target.value.toLowerCase().trim();
    const popover = $("#searchResultsPopover");
    if (!popover) return;

    if (q.length < 2) {
      popover.classList.remove("open");
      popover.innerHTML = "";
      return;
    }

    const results = [];

    // Search Applications
    db.data.applications.forEach(a => {
      if (a.id.toLowerCase().includes(q) || a.customer.toLowerCase().includes(q) || a.location.toLowerCase().includes(q)) {
        results.push({
          type: "Application",
          id: a.id,
          title: `${a.id} • ${a.customer}`,
          meta: `${a.location} · ${packageWithSize(a)} · ${stageGroupOf(a.stage)}`,
          page: "applications",
          action: () => openAppDrawer(a.id)
        });
      }
    });

    // Search Installations
    db.data.installations.forEach(j => {
      if (j.id.toLowerCase().includes(q) || j.appId.toLowerCase().includes(q) || j.customer.toLowerCase().includes(q)) {
        results.push({
          type: "Installation",
          id: j.id,
          title: `${j.id} (${j.installerType})`,
          meta: `${j.customer} · ${j.status} · ${j.schedule}`,
          page: "installations",
          action: () => openInstallModal(j.id)
        });
      }
    });

    // Search Customers
    db.data.customers.forEach(c => {
      if (c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)) {
        results.push({
          type: "Customer",
          id: c.id,
          title: `${c.id} • ${c.name}`,
          meta: `${c.location} · ${c.system}`,
          page: "accounts",
          action: () => {
            state.accountCurrentTab = "customers";
            go("accounts");
            openAccountModal("customers", c.id);
          }
        });
      }
    });

    // Search Installers
    (db.data.installers || []).forEach(inst => {
      if (inst.id.toLowerCase().includes(q) || inst.name.toLowerCase().includes(q) || (inst.contact && inst.contact.toLowerCase().includes(q))) {
        results.push({
          type: "Installer",
          id: inst.id,
          title: `${inst.id} • ${inst.name}`,
          meta: `${inst.type} · ${inst.status}`,
          page: "accounts",
          action: () => {
            state.accountCurrentTab = "installers";
            go("accounts");
            openAccountModal("installers", inst.id);
          }
        });
      }
    });

    // Search Financers
    (db.data.financers || []).forEach(fin => {
      if (fin.id.toLowerCase().includes(q) || fin.name.toLowerCase().includes(q) || (fin.contact && fin.contact.toLowerCase().includes(q))) {
        results.push({
          type: "Financer",
          id: fin.id,
          title: `${fin.id} • ${fin.name}`,
          meta: `${fin.contact} · ${fin.status}`,
          page: "accounts",
          action: () => {
            state.accountCurrentTab = "financers";
            go("accounts");
            openAccountModal("financers", fin.id);
          }
        });
      }
    });

    // Search Merchants
    (db.data.merchants || []).forEach(merch => {
      if (merch.id.toLowerCase().includes(q) || merch.name.toLowerCase().includes(q) || (merch.contact && merch.contact.toLowerCase().includes(q))) {
        results.push({
          type: "Merchant",
          id: merch.id,
          title: `${merch.id} • ${merch.name}`,
          meta: `${merch.contact} · ${merch.status}`,
          page: "accounts",
          action: () => {
            state.accountCurrentTab = "merchants";
            go("accounts");
            openAccountModal("merchants", merch.id);
          }
        });
      }
    });

    // Search Support Tickets
    db.data.support.forEach(s => {
      if (s.id.toLowerCase().includes(q) || s.concern.toLowerCase().includes(q)) {
        results.push({
          type: "Support",
          id: s.id,
          title: `${s.id} • ${s.concern}`,
          meta: `${s.accountType} · ${s.status}`,
          page: "support",
          action: () => openSupportModal(s.id)
        });
      }
    });

    // Search Contact Inquiries
    (db.getInquiries ? db.getInquiries() : []).forEach(inq => {
      if (
        inq.id.toLowerCase().includes(q) ||
        inq.name.toLowerCase().includes(q) ||
        (inq.subject && inq.subject.toLowerCase().includes(q)) ||
        (inq.email && inq.email.toLowerCase().includes(q)) ||
        (inq.message && inq.message.toLowerCase().includes(q))
      ) {
        results.push({
          type: "Contact Inquiry",
          id: inq.id,
          title: `${inq.id} • ${inq.name}`,
          meta: `${inq.category} · ${inq.status}`,
          page: "inquiries",
          action: () => {
            go("inquiries");
            openInquiryModal(inq.id);
          }
        });
      }
    });

    if (!results.length) {
      popover.innerHTML = `<div style="padding:14px; text-align:center; color:var(--muted); font-size:12px;">No matching records found for "${q}".</div>`;
    } else {
      popover.innerHTML = results.slice(0, 6).map((r, idx) => `
        <div class="search-result-item" data-search-idx="${idx}">
          <div class="search-result-main">
            <strong>${r.title}</strong>
            <small>${r.type} • ${r.meta}</small>
          </div>
          <span style="font-size:11px; color:var(--accent); font-weight:700;">Open →</span>
        </div>
      `).join("");

      // Bind click handlers
      $$("#searchResultsPopover .search-result-item").forEach(item => {
        item.addEventListener("click", () => {
          const idx = parseInt(item.dataset.searchIdx, 10);
          const hit = results[idx];
          if (hit) {
            popover.classList.remove("open");
            $("#globalSearchInput").value = "";
            hit.action();
          }
        });
      });
    }

    popover.classList.add("open");
  }

  // ==================== EVENT LISTENERS & WIRING ====================
  function wireEvents() {
    // 1. Navigation clicks
    document.addEventListener("click", e => {
      // data-go handlers
      const goTarget = e.target.closest("[data-go]");
      if (goTarget) {
        const page = goTarget.dataset.go;
        const sub = goTarget.dataset.sub || goTarget.dataset.tab;
        go(page, sub);
        return;
      }

      // Close modal backdrop
      if (e.target.classList.contains("modal-overlay")) {
        e.target.classList.remove("open");
      }

      // Close modal buttons
      const closeBtn = e.target.closest("[data-close-modal]");
      if (closeBtn) {
        const modalId = closeBtn.dataset.closeModal;
        $(`#${modalId}`)?.classList.remove("open");
      }

      // Close popovers if clicked outside
      if (!e.target.closest(".search-box")) {
        $("#searchResultsPopover")?.classList.remove("open");
      }
      if (!e.target.closest(".icon-btn-wrap")) {
        $("#notifPopover")?.classList.remove("open");
      }
    });

    // 2. Sidebar Navigation Links
    $$(".nav-link").forEach(btn => {
      btn.addEventListener("click", () => go(btn.dataset.page));
    });

    // 3. Desktop Collapsible Sidebar
    $("#sidebarCollapseBtn")?.addEventListener("click", () => {
      const sidebar = $("#sidebar");
      if (!sidebar) return;
      sidebar.classList.toggle("collapsed");
      const isCollapsed = sidebar.classList.contains("collapsed");
      localStorage.setItem("HELLO_SOLAR_SIDEBAR_COLLAPSED", isCollapsed ? "true" : "false");
      const btn = $("#sidebarCollapseBtn");
      if (btn) {
        btn.setAttribute("title", isCollapsed ? "Show Sidebar" : "Hide Sidebar");
        btn.setAttribute("aria-label", isCollapsed ? "Show Sidebar" : "Hide Sidebar");
      }
    });

    // Restore desktop sidebar collapsed state
    if (localStorage.getItem("HELLO_SOLAR_SIDEBAR_COLLAPSED") === "true") {
      $("#sidebar")?.classList.add("collapsed");
      const btn = $("#sidebarCollapseBtn");
      if (btn) {
        btn.setAttribute("title", "Show Sidebar");
        btn.setAttribute("aria-label", "Show Sidebar");
      }
    }

    // 4. Mobile Menu
    $("#mobileMenuBtn")?.addEventListener("click", () => {
      $("#sidebar")?.classList.toggle("open");
    });
    $("#sidebarBackdrop")?.addEventListener("click", () => {
      $("#sidebar")?.classList.remove("open");
    });

    // 5. Global Search Keyboard Shortcut
    document.addEventListener("keydown", e => {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault();
        $("#globalSearchInput")?.focus();
      }
      if (e.key === "Escape") {
        $$(".modal-overlay").forEach(m => m.classList.remove("open"));
        $("#appDrawerOverlay")?.classList.remove("open");
        $("#searchResultsPopover")?.classList.remove("open");
        $("#notifPopover")?.classList.remove("open");
        $("#userProfileWrap")?.classList.remove("open");
      }
    });

    $("#globalSearchInput")?.addEventListener("input", handleGlobalSearch);

    // 6. Notification Bell Toggle
    $("#notifBellBtn")?.addEventListener("click", () => {
      $("#notifPopover")?.classList.toggle("open");
      $("#userProfileWrap")?.classList.remove("open");
    });

    // 6b. User Profile Dropdown
    $("#userProfileBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const wrap = $("#userProfileWrap");
      if (!wrap) return;
      wrap.classList.toggle("open");
      // Close notification popover when opening profile dropdown
      $("#notifPopover")?.classList.remove("open");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      const wrap = $("#userProfileWrap");
      if (wrap && !wrap.contains(e.target)) {
        wrap.classList.remove("open");
      }
    });

    // Dropdown navigation items
    $$("[data-dropdown-go]").forEach(item => {
      item.addEventListener("click", () => {
        const pageId = item.dataset.dropdownGo;
        $("#userProfileWrap")?.classList.remove("open");
        go(pageId);
      });
    });

    // Logout button
    $("#dropdownLogout")?.addEventListener("click", () => {
      $("#userProfileWrap")?.classList.remove("open");
      window.SuperAdminAuth.logout();
    });

    // 7. Notification / Attention Quick Action Delegation
    document.addEventListener("click", e => {
      const actionBtn = e.target.closest("[data-action-type]");
      if (actionBtn) {
        const type = actionBtn.dataset.actionType;
        const payload = actionBtn.dataset.payload;

        $("#notifPopover")?.classList.remove("open");

        if (type === "view_app") {
          go("applications");
          openAppDrawer(payload);
        } else if (type === "view_job") {
          go("installations");
          openInstallModal(payload);
        } else if (type === "view_payment") {
          go("payments");
          openPaymentModal(payload);
        } else if (type === "view_ticket") {
          go("support");
          openSupportModal(payload);
        }
      }
    });

    // 8. Top-bar Direct Projects Button & KPI Attention Scroll
    $("#quickDirectBtn")?.addEventListener("click", () => {
      go("installations", "direct");
    });

    $("#kpiAttentionCard")?.addEventListener("click", () => {
      const section = $("#needsAttentionSection");
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        section.classList.add("highlight-pulse");
        setTimeout(() => section.classList.remove("highlight-pulse"), 1200);
      }
    });

    // Overview Needs Attention Category Tabs (Applications, Installations, Payments, Support)
    $$("#overviewAttentionFilterTabs .chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#overviewAttentionFilterTabs .chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.overviewAttentionFilter = btn.dataset.source;
        state.overviewAttentionExpanded = false;
        renderOverview();
      });
    });

    // Overview Needs Attention See More / See Less Toggle
    $("#toggleAttentionRowsBtn")?.addEventListener("click", () => {
      state.overviewAttentionExpanded = !state.overviewAttentionExpanded;
      renderOverview();
      if (!state.overviewAttentionExpanded) {
        $("#needsAttentionSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    // 9. Overview Activity Tabs
    $$("#overviewActivityFilterTabs .chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#overviewActivityFilterTabs .chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.overviewActivityFilter = btn.dataset.filter;
        state.overviewActivityExpanded = false;
        renderOverviewActivity();
      });
    });

    // Overview Activity See More / See Less Toggle
    $("#toggleActivityRowsBtn")?.addEventListener("click", () => {
      state.overviewActivityExpanded = !state.overviewActivityExpanded;
      renderOverviewActivity();
      if (!state.overviewActivityExpanded) {
        $("#recentActivitySection")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    // 10. Applications Filtering & Events
    $$("#appFilterChips .chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#appFilterChips .chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.appStageFilter = btn.dataset.stage;
        renderApplications();
      });
    });

    $("#appSearchInput")?.addEventListener("input", e => {
      state.appSearchQuery = e.target.value;
      renderApplications();
    });

    $("#appFinancerFilter")?.addEventListener("change", e => {
      state.appFinancerFilter = e.target.value;
      renderApplications();
    });

    // Open Direct Install Modal via Home Icon button
    document.addEventListener("click", e => {
      const homeBtn = e.target.closest("[data-open-direct-modal]");
      if (homeBtn) {
        const appId = homeBtn.dataset.openDirectModal;
        openDirectInstallModal(appId);
      }

      const viewAppBtn = e.target.closest("[data-view-app]");
      if (viewAppBtn) {
        const appId = viewAppBtn.dataset.viewApp;
        // From an Applications filter, Details opens on the tab related to that filter
        state.appDrawerTab = (state.currentPage === "applications" && STAGE_GROUP_TAB[state.appStageFilter]) || "overview";
        openAppDrawer(appId);
      }
    });

    // Direct Install Confirmation Modal Confirm
    $("#btnConfirmDirectInstall")?.addEventListener("click", confirmDirectInstall);
    // Hello Solar Funding
    document.addEventListener("click", e => {
      const fundBtn = e.target.closest("[data-hs-funding]");
      if (fundBtn) openHsFundingModal(fundBtn.dataset.hsFunding);
      if (e.target.closest("#btnDrawerHsFunding, #btnDrawerFootHsFunding") && state.selectedAppId) openHsFundingModal(state.selectedAppId);
    });
    $("#btnConfirmHsFunding")?.addEventListener("click", confirmHsFunding);
    // Signed agreement uploaded by the customer (Documents page): view the file, accept it or ask for a re-upload
    document.addEventListener("click", e => {
      const t = e.target.closest("[data-agreement-view],[data-agreement-accept],[data-agreement-reupload]");
      if (!t || !window.HSShared) return;
      const appId = t.dataset.agreementView || t.dataset.agreementAccept || t.dataset.agreementReupload;
      const ag = window.HSShared.agreementFor(appId);
      if (!ag) return;
      if (t.dataset.agreementView) {
        const f = window.HSShared.agreementFileFor(appId);
        openStoredFile(f && f.fileData, { fileName: ag.fileName, eyebrow: "SIGNED AGREEMENT",
          title: `${ag.title} · ${appId}${ag.uploadedAt ? ` · uploaded ${svDate(String(ag.uploadedAt).slice(0, 10))}` : ""}` });
        return;
      }
      const accept = !!t.dataset.agreementAccept;
      let note = "";
      if (!accept) {
        note = window.prompt("Why should the customer upload the agreement again?", "Please upload a clear copy with your full name, contact number, date and signature.");
        if (note === null) return;
      }
      const res = window.HSShared.reviewAgreement(appId, accept ? "ACCEPTED" : "REUPLOAD_REQUIRED", note, SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)");
      if (!res.ok) { showToast(res.error, "danger", "⚠"); return; }
      db.data = db.load();
      showToast(accept ? `Signed ${ag.title} accepted for ${appId}.` : `Customer asked to upload the ${ag.title} again.`, "success", "✓");
      openAppDrawer(appId);
    });

    // Drawer handlers
    $("#drawerCloseBtn")?.addEventListener("click", () => $("#appDrawerOverlay")?.classList.remove("open"));
    $("#drawerDoneBtn")?.addEventListener("click", () => $("#appDrawerOverlay")?.classList.remove("open"));
    $("#appDrawerOverlay")?.addEventListener("click", e => {
      if (e.target.id === "appDrawerOverlay") $("#appDrawerOverlay")?.classList.remove("open");
    });
    $("#btnDrawerDirectAccept")?.addEventListener("click", () => {
      if (state.selectedAppId) {
        openDirectInstallModal(state.selectedAppId);
      }
    });
    $("#btnDrawerReassignDirect")?.addEventListener("click", () => {
      if (state.selectedAppId) {
        openDirectInstallModal(state.selectedAppId);
      }
    });

    // Drawer Tabs switching
    document.addEventListener("click", e => {
      const tabBtn = e.target.closest("#appDrawerTabs .drawer-tab");
      if (tabBtn) {
        switchDrawerTab(tabBtn.dataset.dtab);
      }
    });

    // Request a document / mark one not required / require it again
    document.addEventListener("click", e => {
      const reqBtn = e.target.closest("[data-doc-request]");
      if (reqBtn) { openDocRequestModal("request", reqBtn.dataset.docRequest); return; }
      const waiveBtn = e.target.closest("[data-doc-waive]");
      if (waiveBtn && state.selectedAppId) { openDocRequestModal("waive", state.selectedAppId, waiveBtn.dataset.docWaive, waiveBtn.dataset.docLabel); return; }
      const reqAgain = e.target.closest("[data-doc-require]");
      if (reqAgain && state.selectedAppId) requireDocumentAgain(state.selectedAppId, reqAgain.dataset.docRequire);
    });
    $("#btnConfirmDocRequest")?.addEventListener("click", confirmDocRequest);
    $("#docRequestModal")?.addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.matches("input")) { e.preventDefault(); confirmDocRequest(); }
    });

    // Document Preview
    document.addEventListener("click", e => {
      const prevBtn = e.target.closest("[data-preview-doc]");
      if (prevBtn) {
        const [appId, docName] = prevBtn.dataset.previewDoc.split(":");
        openDocPreviewModal(appId, docName);
      }
    });

    // Verify document from preview modal
    $("#btnDpmVerify")?.addEventListener("click", () => {
      if (state.selectedAppId) {
        const docTitle = state.dpmDocName || $("#dpmTitle")?.textContent;
        db.updateDocumentStatus(state.selectedAppId, docTitle, "Verified");
        $("#docPreviewModal")?.classList.remove("open");
        showToast(`Document "${$("#dpmTitle")?.textContent || docTitle}" marked as Accepted.`, "success", "✓");
        renderCurrentPage();
        if ($("#appDrawerOverlay")?.classList.contains("open")) {
          openAppDrawer(state.selectedAppId);
        }
      }
    });

    // Assign Partner confirmation
    $("#btnConfirmAssignPartner")?.addEventListener("click", confirmAssignPartner);
    $("#btnConfirmAssignFinancer")?.addEventListener("click", confirmAssignFinancer);
    $("#btnVerifyInstallmentReceipt")?.addEventListener("click", () => reviewInstallmentReceipt("verify"));
    $("#btnRejectInstallmentReceipt")?.addEventListener("click", () => reviewInstallmentReceipt("reject"));

    // Context & Tab Action Delegation
    document.addEventListener("click", e => {
      if (e.target.id === "btnTabDirectAccept" || e.target.id === "btnDrawerFootDirect" || e.target.id === "btnTabReassignDirect" || e.target.id === "btnDrawerFootReassign") {
        if (state.selectedAppId) openDirectInstallModal(state.selectedAppId);
      } else if (e.target.id === "btnTabAssignPartner" || e.target.id === "btnDrawerFootPartner" || e.target.id === "btnTabChangePartner") {
        if (state.selectedAppId) openAssignPartnerModal(state.selectedAppId);
      } else if (e.target.id === "btnDrawerVerifyDownPayment") {
        if (!state.selectedAppId || IS_ENGINEER) return;
        const res = db.verifyDownPayment(state.selectedAppId, { adminUser: SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)" });
        if (!res.success) {
          showToast(res.error, "danger", "⚠");
          return;
        }
        showToast(`Down payment verified for ${safeText(state.selectedAppId)}.`, "success", "✓");
        openAppDrawer(state.selectedAppId);
        if (typeof renderCurrentPage === "function") renderCurrentPage();
      } else if (e.target.id === "btnViewDownPaymentReceipt") {
        const app = db.data.applications.find(x => x.id === state.selectedAppId);
        const proof = app && app.downPaymentProof;
        if (!proof || !proof.dataUrl) return;
        openStoredFile(proof.dataUrl, { fileName: proof.fileName, title: `Down Payment · ${app.id}` });
      } else if (e.target.id === "btnDrawerAssignFinancer") {
        if (state.selectedAppId) openAssignFinancerModal(state.selectedAppId);
      } else if (e.target.id === "btnDrawerReviewDocs") {
        switchDrawerTab("documents");
      } else if (e.target.id === "btnDrawerGoInstalls") {
        $("#appDrawerOverlay")?.classList.remove("open");
        go("installations");
        state.installTypeFilter = "Hello Solar Direct";
        syncInstallTabs();
        renderInstallations();
      } else if (e.target.id === "btnDrawerApproveApp") {
        if (state.selectedAppId) {
          db.updateApplicationStage(state.selectedAppId, "Approved");
          showToast(`Application ${state.selectedAppId} approved for solar financing disbursement.`, "success", "✓");
          renderCurrentPage();
          openAppDrawer(state.selectedAppId);
        }
      } else if (e.target.id === "btnDrawerDeclineApp") {
        if (state.selectedAppId) {
          db.updateApplicationStage(state.selectedAppId, "Declined");
          showToast(`Application ${state.selectedAppId} declined.`, "danger", "✕");
          renderCurrentPage();
          openAppDrawer(state.selectedAppId);
        }
      }
    });

    // 11. Installations Filtering & Events
    $$("#installFilterTabs .chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#installFilterTabs .chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.installTypeFilter = btn.dataset.type;
        renderInstallations();
      });
    });

    $("#installStatusSelect")?.addEventListener("change", e => {
      state.installStatusFilter = e.target.value;
      renderInstallations();
    });

    $("#installSearchInput")?.addEventListener("input", e => {
      state.installSearchQuery = e.target.value;
      renderInstallations();
    });

    document.addEventListener("click", e => {
      const updateJobBtn = e.target.closest("[data-update-job]");
      if (updateJobBtn) {
        const jobId = updateJobBtn.dataset.updateJob;
        openInstallModal(jobId);
      }
    });

    $("#btnSaveInstallModal")?.addEventListener("click", saveInstallModal);
    $("#btnSaveMaintenance")?.addEventListener("click", saveMaintenanceModal);
    document.addEventListener("click", e => {
      const step = e.target.closest("#mmMaintStepper [data-mm-step]");
      if (step) { setMaintStep(step.dataset.mmStep); return; }
      const tab = e.target.closest("#mmTabs [data-mmtab]");
      if (tab) switchMaintTab(tab.dataset.mmtab);
    });
    $("#mmMaintPersonSelect")?.addEventListener("change", e => {
      const cur = e.target.dataset.current || "";
      if ($("#mmPersonHint")) $("#mmPersonHint").style.display = cur && e.target.value && e.target.value !== cur ? "block" : "none";
    });
    $$("#maintFilterTabs .chip-btn").forEach(btn => btn.addEventListener("click", () => {
      state.maintFilter = btn.dataset.status;
      renderMaintenance();
    }));
    $("#maintSearch")?.addEventListener("input", renderMaintenance);
    document.addEventListener("click", e => {
      const btn = e.target.closest("[data-manage-maint]");
      if (btn) openMaintenanceModal(btn.dataset.manageMaint);
    });
    document.addEventListener("click", e => {
      const btn = e.target.closest("[data-maint-respond]");
      if (!btn || !IS_ENGINEER) return;
      const res = db.respondMaintenance(btn.dataset.job, btn.dataset.maintRespond, ENGINEER.name);
      showToast(res.success ? `Maintenance ${btn.dataset.maintRespond === "accept" ? "accepted" : "declined"} for ${btn.dataset.job}.` : res.message, res.success ? "success" : "warn", res.success ? "✓" : "⚠");
      renderCurrentPage();
    });
    $("#btnNewInstallModalOpen")?.addEventListener("click", openNewInstallModal);
    $("#btnSaveNewInstall")?.addEventListener("click", saveNewInstall);

    // Install Modal tab switcher delegation
    document.addEventListener("click", e => {
      const imTab = e.target.closest("#installModalTabs .modal-tab");
      if (imTab) {
        switchInstallModalTab(imTab.dataset.imtab);
      }
    });

    // Install Modal status progression change
    $("#imStatusSelect")?.addEventListener("change", e => {
      updateInstallModalStepper(e.target.value);
    });

    // Schedule Ready Project candidate selection change
    $("#newInstallAppSelect")?.addEventListener("change", e => {
      const cand = currentSchedulableCandidates.find(c => (c.appId === e.target.value || c.id === e.target.value));
      updateNewInstallModalPreview(cand);
    });

    // 12. Accounts Filtering & Events
    $$("#accountSubtabs .subtab").forEach(tab => {
      tab.addEventListener("click", () => {
        $$("#accountSubtabs .subtab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        state.accountCurrentTab = tab.dataset.tab;
        renderAccounts();
      });
    });

    $("#accountSearchInput")?.addEventListener("input", e => {
      state.accountSearchQuery = e.target.value;
      renderAccounts();
    });

    $("#accountStatusFilter")?.addEventListener("change", e => {
      state.accountStatusFilter = e.target.value;
      renderAccounts();
    });

    document.addEventListener("click", e => {
      const viewAccBtn = e.target.closest("[data-view-account]");
      if (viewAccBtn) {
        const [typeKey, id] = viewAccBtn.dataset.viewAccount.split(":");
        openAccountModal(typeKey, id);
        return;
      }

      const gotoAppBtn = e.target.closest("[data-goto-app]");
      if (gotoAppBtn) {
        const appId = gotoAppBtn.dataset.gotoApp;
        $("#accountModal")?.classList.remove("open");
        go("applications");
        openAppDrawer(appId);
        return;
      }

      const gotoJobBtn = e.target.closest("[data-goto-job]");
      if (gotoJobBtn) {
        const jobId = gotoJobBtn.dataset.gotoJob;
        $("#accountModal")?.classList.remove("open");
        go("installations");
        openInstallModal(jobId);
        return;
      }

      const adminActBtn = e.target.closest("[data-admin-action]");
      if (adminActBtn) {
        const act = adminActBtn.dataset.adminAction;
        openAccountActionConfirmModal(act);
        return;
      }

      const acmTabBtn = e.target.closest("#accountModalTabs .modal-tab");
      if (acmTabBtn) {
        switchAccountModalTab(acmTabBtn.dataset.acmtab);
        return;
      }

      const editContractBtn = e.target.closest("[data-edit-financer-contract]");
      if (editContractBtn) {
        openFinancerContractModal(editContractBtn.dataset.editFinancerContract);
        return;
      }

      const instCostBtn = e.target.closest("[data-edit-install-cost]");
      if (instCostBtn) {
        openInstallationCostModal(instCostBtn.dataset.editInstallCost);
        return;
      }

      const disconnectBtn = e.target.closest("[data-request-disconnect]");
      if (disconnectBtn) {
        openSystemDisconnectModal(disconnectBtn.dataset.requestDisconnect);
        return;
      }
    });

    $("#btnConfirmSystemDisconnect")?.addEventListener("click", submitSystemDisconnect);
    $("#accSystemSearch")?.addEventListener("input", renderSystemConnectionTable);
    // Accounting tabs, ledger and funder filters
    document.addEventListener("click", e => {
      const tab = e.target.closest("[data-acc-tab]");
      if (tab) { state.accTab = tab.dataset.accTab; renderAccountingTabs(); return; }
      const sub = e.target.closest("[data-acc-sub]");
      if (sub) { state.accSub[state.accTab] = sub.dataset.accSub; renderAccountingTabs(); return; }
      const go = e.target.closest("[data-acc-go]");
      if (go) {
        const [t, s, filter] = go.dataset.accGo.split(":");
        state.accTab = t;
        if (s) state.accSub[t] = s;
        if (filter === "check") { state.accLedgerStatus = "Pending Verification"; renderPaymentsLedger(); }
        renderAccountingTabs();
        return;
      }
      const mn = e.target.closest("[data-acc-month]");
      if (mn) {
        const next = accShiftMonth(accMonth(), Number(mn.dataset.accMonth));
        if (next <= accThisMonth()) { state.accMonth = next; renderMoneyOverview(); renderFunderSchedule(); }
        return;
      }
      const fp = e.target.closest("[data-funder-paid]");
      if (fp) { toggleFunderPaid(fp.dataset.funderPaid, false); return; }
      const fu = e.target.closest("[data-funder-undo]");
      if (fu) { toggleFunderPaid(fu.dataset.funderUndo, true); return; }
      const ls = e.target.closest("[data-ledger-status]");
      if (ls) { state.accLedgerStatus = ls.dataset.ledgerStatus; renderPaymentsLedger(); return; }
      const lv = e.target.closest("[data-ledger-verify]");
      if (lv) { verifyLedgerRow(lv.dataset.ledgerVerify); return; }
      const lr = e.target.closest("[data-ledger-receipt]");
      if (lr) { openLedgerReceipt(lr.dataset.ledgerReceipt); return; }
      const ft = e.target.closest("[data-acc-funder]");
      if (ft) { state.accFunderFilter = ft.dataset.accFunder; renderCustomerSchedule(); return; }
    });
    $("#accLedgerSearch")?.addEventListener("input", renderPaymentsLedger);
    $("#accLedgerChannel")?.addEventListener("change", renderPaymentsLedger);
    $("#accCustSchedSearch")?.addEventListener("input", renderCustomerSchedule);
    $("#accInstCostSearch")?.addEventListener("input", renderInstallationCostTable);
    ["#icMaterialsInput", "#icLaborInput", "#icTransportInput"].forEach(id => $(id)?.addEventListener("input", updateInstallationCostTotal));
    $("#btnSaveInstallationCost")?.addEventListener("click", saveInstallationCost);
    $("#installationCostModal")?.addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.matches("input")) { e.preventDefault(); saveInstallationCost(); }
    });

    $("#fcTermInput")?.addEventListener("input", autoFillFinancerContractEnd);
    $("#fcStartInput")?.addEventListener("change", autoFillFinancerContractEnd);
    $("#fcEndInput")?.addEventListener("change", updateFinancerContractPreview);
    $("#fcStatusOverride")?.addEventListener("change", updateFinancerContractPreview);
    $("#btnSaveFinancerContract")?.addEventListener("click", saveFinancerContract);

    $("#btnConfirmAccountAction")?.addEventListener("click", executeAccountAction);

    // 13. Payments Events
    $$("#paymentFilterTabs .chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#paymentFilterTabs .chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.paymentStatusFilter = btn.dataset.status;
        renderPayments();
      });
    });

    $("#paymentSearchInput")?.addEventListener("input", e => {
      state.paymentSearchQuery = e.target.value;
      renderPayments();
    });

    document.addEventListener("click", e => {
      const viewPayBtn = e.target.closest("[data-view-payment], [data-manage-payment]");
      if (viewPayBtn) {
        const appId = viewPayBtn.dataset.viewPayment || viewPayBtn.dataset.managePayment;
        openPaymentModal(appId);
        return;
      }

      const reviewReceiptBtn = e.target.closest("[data-review-receipt]");
      if (reviewReceiptBtn) {
        const appId = reviewReceiptBtn.dataset.reviewReceipt;
        openReviewReceiptModal(appId);
        return;
      }

      const pmTabBtn = e.target.closest("#pmModalTabs .modal-tab");
      if (pmTabBtn) {
        switchPaymentModalTab(pmTabBtn.dataset.pmtab);
        return;
      }

      if (e.target.closest("#btnOpenRecordPaymentModal") || e.target.closest("#btnHistoryAddPayment")) {
        openRecordPaymentConfirmModal();
        return;
      }

      if (e.target.closest("#btnOpenAdjustPaymentModal")) {
        openPaymentAdjustModal();
        return;
      }
    });

    $("#btnConfirmRecordPayment")?.addEventListener("click", confirmRecordPaymentAction);
    $("#btnConfirmPaymentAdjust")?.addEventListener("click", confirmPaymentAdjustAction);

    // Review Receipt Modal Action Handlers
    $("#btnVerifyPayment")?.addEventListener("click", () => {
      const appId = $("#rrAppId")?.value || state.selectedAppId;
      if (!appId) return;
      const res = db.verifyPaymentReceipt(appId, { adminUser: "ADMIN (Limuel)" });
      if (res && res.success) {
        showToast(`Full payment verified for ${appId}. Status is now Pending Installation.`, "success", "✓");
        $("#reviewReceiptModal")?.classList.remove("open");
        renderPayments();
        if (typeof renderApplications === "function") renderApplications();
        updateBadgesAndKPIs();
      }
    });

    $("#btnRejectPayment")?.addEventListener("click", () => {
      const box = $("#rrRejectReasonBox");
      if (box) {
        box.style.display = box.style.display === "none" ? "block" : "none";
        $("#rrRejectReasonInput")?.focus();
      }
    });

    $("#btnCancelRejectReason")?.addEventListener("click", () => {
      if ($("#rrRejectReasonBox")) $("#rrRejectReasonBox").style.display = "none";
    });

    $("#btnConfirmRejectPayment")?.addEventListener("click", () => {
      const appId = $("#rrAppId")?.value || state.selectedAppId;
      if (!appId) return;
      const reason = $("#rrRejectReasonInput")?.value.trim() || "Receipt image unclear or amount mismatch";
      const res = db.rejectPaymentReceipt(appId, { reason, adminUser: "ADMIN (Limuel)" });
      if (res && res.success) {
        showToast(`Receipt rejected for ${appId}. Customer requested to re-upload.`, "danger", "✕");
        $("#reviewReceiptModal")?.classList.remove("open");
        renderPayments();
        if (typeof renderApplications === "function") renderApplications();
        updateBadgesAndKPIs();
      }
    });

    $("#btnSimulateCustomerUpload")?.addEventListener("click", () => {
      const appId = $("#rrAppId")?.value || state.selectedAppId;
      if (!appId) return;
      const res = db.uploadCustomerReceipt(appId);
      if (res && res.success) {
        showToast(`Customer uploaded transfer receipt for ${appId}. Status: Verification Required.`, "success", "↑");
        openReviewReceiptModal(appId);
        renderPayments();
        if (typeof renderApplications === "function") renderApplications();
        updateBadgesAndKPIs();
      }
    });

    // 14. Support Events
    $$("#supportStatusFilterTabs .chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#supportStatusFilterTabs .chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.supportStatusFilter = btn.dataset.status;
        renderSupport();
      });
    });

    $("#supportSearchInput")?.addEventListener("input", e => {
      state.supportSearchQuery = e.target.value;
      renderSupport();
    });

    $("#supportPortalSelect")?.addEventListener("change", e => {
      state.supportPortalFilter = e.target.value;
      renderSupport();
    });

    $("#supportPrioritySelect")?.addEventListener("change", e => {
      state.supportPriorityFilter = e.target.value;
      renderSupport();
    });

    // Support status selection change (toggle resolution note requirement)
    $("#smStatusSelect")?.addEventListener("change", e => {
      const isResolved = e.target.value === "Resolved";
      if ($("#smResolutionGroup")) $("#smResolutionGroup").style.display = isResolved ? "block" : "none";
      if ($("#smResolutionError")) $("#smResolutionError").style.display = "none";
    });

    document.addEventListener("click", e => {
      // Support Modal Tab switcher
      const spTab = e.target.closest("#supportModalTabs .modal-tab");
      if (spTab) {
        switchSupportModalTab(spTab.dataset.sptab);
        return;
      }

      // Reopen ticket controls
      if (e.target.closest("#btnShowReopenForm")) {
        if ($("#smReopenBox")) $("#smReopenBox").style.display = "block";
        if ($("#smReopenTriggerBox")) $("#smReopenTriggerBox").style.display = "none";
        return;
      }
      if (e.target.closest("#btnCancelReopen")) {
        if ($("#smReopenBox")) $("#smReopenBox").style.display = "none";
        if ($("#smReopenTriggerBox")) $("#smReopenTriggerBox").style.display = "block";
        return;
      }
      if (e.target.closest("#btnConfirmReopen")) {
        confirmReopenAction();
        return;
      }

      // Send ticket reply
      if (e.target.closest("#btnSendTicketReply")) {
        sendTicketReplyAction();
        return;
      }

      // Clickable related records (APP-, JOB-, CUS-, FIN-, INS-, MER-)
      const relBtn = e.target.closest("[data-open-record]");
      if (relBtn) {
        const recId = relBtn.dataset.openRecord;
        if (recId) openRelatedRecord(recId);
        return;
      }

      // Manage / View ticket buttons
      const manageTicketBtn = e.target.closest("[data-manage-ticket]");
      if (manageTicketBtn) {
        const ticketId = manageTicketBtn.dataset.manageTicket;
        openSupportModal(ticketId);
        return;
      }

      // Partner inquiry: approve (review step)
      const approvePartnerBtn = e.target.closest('[data-approve-partner-inquiry]');
      if (approvePartnerBtn) {
        const res = db.approvePartnerInquiry(approvePartnerBtn.dataset.approvePartnerInquiry, SESSION.name ? `ADMIN (${SESSION.name})` : "ADMIN (Limuel)");
        if (!res.success) {
          showToast(res.error, "danger", "⚠");
          return;
        }
        showToast(`${safeText(partnerTypeLabel(res.inquiry))} inquiry ${safeText(res.inquiry.id)} approved. You can now create the account.`, "success", "✓");
        openInquiryModal(res.inquiry.id);
        renderInquiries();
        updateBadgesAndKPIs();
        return;
      }

      // Partner inquiry: open Create Account prefilled (account is NOT created until the form is submitted)
      const createPartnerBtn = e.target.closest('[data-create-partner-account]');
      if (createPartnerBtn) {
        const inq = db.getInquiries().find(i => i.id === createPartnerBtn.dataset.createPartnerAccount);
        if (!inq || !db.isPartnerInquiry(inq)) return;
        if (inq.inquiryStatus !== "Approved") {
          showToast("Approve the partner inquiry before creating an account.", "danger", "⚠");
          return;
        }
        if (inq.accountCreated) {
          showToast(`This inquiry already has an account (${safeText(inq.linkedAccountId || "")}).`, "danger", "⚠");
          return;
        }
        // The partner type (chosen in Contact Inquiries from their message) decides which account is created
        if (!inq.partnerType) {
          showToast("Select the partner type (Financer, Installer or Merchant) in the inquiry details first.", "warn", "⚠");
          openInquiryModal(inq.id);
          return;
        }
        state.createAccountRole = inq.partnerType;
        resetCreateAccountForm();
        state.createPartnerInquiryId = inq.id;
        state.createPartnerInquiryRole = inq.partnerType;
        $('#inquiryModal')?.classList.remove('open');
        go('create-account', inq.partnerType);
        prefillPartnerInquiry(inq);
        showToast(`Create ${safeText(inq.partnerType)} Account prefilled from ${safeText(inq.id)}. Complete the remaining fields and submit.`, "success", "✓");
        return;
      }

      // Manage / View inquiry buttons
      const createInqBtn = e.target.closest('[data-create-inquiry]');
      if (createInqBtn) {
        const inqId = createInqBtn.dataset.createInquiry;
        const inq = (db.getInquiries ? db.getInquiries() : []).find(i => i.id === inqId);
        const resp = inq ? (inq.inquiryStatus || inq.customerResponse) : null;
        if (resp !== 'Proceed') {
          showToast('Customer account creation is only permitted when customer response is "Proceed".', 'warn', '⚠');
          return;
        }
        state.createAccountRole = 'Customer';
        resetCreateAccountForm();
        state.createInquiryId = inqId;
        state.customerProjectDraft = null;
        $('#dynamicRoleFieldsGrid').dataset.role = '';
        $('#inquiryModal')?.classList.remove('open');
        go('create-account', 'Customer');
        return;
      }
      const manageInqBtn = e.target.closest("[data-manage-inquiry]");
      if (manageInqBtn) {
        const inqId = manageInqBtn.dataset.manageInquiry;
        openInquiryModal(inqId);
        return;
      }
    });

    $("#btnSaveSupportTicket")?.addEventListener("click", saveSupportModal);

    // 14B. Contact Inquiries Events
    $$("#inquiryStatusFilterTabs .chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#inquiryStatusFilterTabs .chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.inquiryStatusFilter = btn.dataset.status;
        renderInquiries();
      });
    });

    $("#inquirySearchInput")?.addEventListener("input", e => {
      state.inquirySearchQuery = e.target.value;
      renderInquiries();
    });

    $("#inquiryResponseFilterSelect")?.addEventListener("change", e => {
      state.inquiryResponseFilter = e.target.value;
      renderInquiries();
    });

    $("#inquiryPaymentFilterSelect")?.addEventListener("change", e => {
      state.inquiryPaymentFilter = e.target.value;
      renderInquiries();
    });

    $("#inquiryCategorySelect")?.addEventListener("change", e => {
      state.inquiryCategoryFilter = e.target.value;
      renderInquiries();
    });


    $("#inqKpiCardUnread")?.addEventListener("click", () => {
      $$("#inquiryStatusFilterTabs .chip-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.status === "Unread");
      });
      state.inquiryStatusFilter = "Unread";
      renderInquiries();
    });

    $("#inqKpiCardReplied")?.addEventListener("click", () => {
      $$("#inquiryStatusFilterTabs .chip-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.status === "Replied");
      });
      state.inquiryStatusFilter = "Replied";
      renderInquiries();
    });

    $("#btnInquiryMarkReplied")?.addEventListener("click", markInquiryRepliedAction);
    $("#btnInquiryMarkUnread")?.addEventListener("click", markInquiryUnreadAction);
    $("#btnExportInquiries")?.addEventListener("click", exportInquiriesAction);
    $("#btnSendInquiryConfirmationEmail")?.addEventListener("click", sendInquiryConfirmationEmailAction);
    $("#btnCopyInquiryConfirmationLink")?.addEventListener("click", copyConfirmationLinkAction);
    $("#btnSaveInquiryConfirmationMessage")?.addEventListener("click", saveInquiryConfirmationMessageAction);
    $("#btnInquiryClose")?.addEventListener("click", () => {
      const inqId = $("#inqModalId")?.value || state.selectedInquiryId;
      const inq = (db.getInquiries ? db.getInquiries() : []).find(i => i.id === inqId);
      if (inq && (inq.customerResponse === "Not Proceed" || inq.inquiryStatus === "Not Proceeding")) {
        showToast(`Inquiry ${inqId} closed`, "neutral", "✓");
      }
    });

    // Cross-tab synchronization for customer confirmation portal
    window.addEventListener("storage", e => {
      if (!e.key || e.key === "HELLO_SOLAR_SUPER_ADMIN_DATA_V2") {
        if (db && typeof db.load === "function") db.load();
        if (state.currentSection === "inquiries") {
          renderInquiries();
          updateBadgesAndKPIs();
          const modal = $("#inquiryModal");
          if (modal && modal.classList.contains("open") && state.selectedInquiryId) {
            openInquiryModal(state.selectedInquiryId);
          }
        }
      }
    });

    // 14C. Create Account Events
    $$("#createAccountRoleTabs [data-role]").forEach(tab => {
      tab.addEventListener("click", () => {
        const role = tab.dataset.role;
        if (role) {
          state.createAccountRole = role;
          if ($('#btnSubmitCreateAccount').disabled) resetCreateAccountForm();
          renderCreateAccount();
        }
      });
    });

    $("#newAccRole")?.addEventListener("change", e => {
      state.createAccountRole = e.target.value;
      if ($('#btnSubmitCreateAccount').disabled) resetCreateAccountForm();
      renderCreateAccount();
    });

    // Size dropdowns to the space below their field, including dynamically rendered roles.
    const sizeAccountDropdown = event => {
      const select = event.target.closest?.('#createAccountForm select.input-field');
      if (!select) return;
      const available = window.innerHeight - select.getBoundingClientRect().bottom - 12;
      select.style.setProperty('--dropdown-space', `${Math.max(0, available)}px`);
    };
    ['pointerdown', 'focusin', 'keydown'].forEach(type => {
      $('#createAccountForm')?.addEventListener(type, sizeAccountDropdown);
    });
    const resizeAccountDropdown = () => {
      if (document.activeElement) sizeAccountDropdown({ target: document.activeElement });
    };
    window.addEventListener('resize', resizeAccountDropdown);
    window.addEventListener('scroll', resizeAccountDropdown, true);

    $("#createAccountForm")?.addEventListener("submit", handleCreateAccountSubmit);
    $("#btnResetAccountForm")?.addEventListener("click", resetCreateAccountForm);
    $("#btnGenPassword")?.addEventListener("click", generateRandomPassword);

    $("#btnTogglePasswordVisibility")?.addEventListener("click", () => {
      const passInp = $("#newAccPassword");
      if (passInp) {
        passInp.type = passInp.type === "password" ? "text" : "password";
        updatePasswordVisibilityIcon();
      }
    });
    updatePasswordVisibilityIcon();

    $("#btnCreateAnotherAcc")?.addEventListener("click", () => {
      resetCreateAccountForm();
      $("#newAccFirstName")?.focus();
    });

    $("#btnViewCreatedAccInPortal")?.addEventListener("click", () => {
      const targetTab = state.lastCreatedAccountTab || "customers";
      go("accounts", targetTab);
    });

    $("#btnSendActivationEmail")?.addEventListener("click", sendActivationEmailAction);

    $("#btnGoToCreateAccount")?.addEventListener("click", () => {
      go("create-account");
    });

    $("#btnNavToPortalAccounts")?.addEventListener("click", () => {
      go("accounts");
    });

    // 15. Activity Events
    $("#activityRoleSelect")?.addEventListener("change", e => {
      state.activityRoleFilter = e.target.value;
      renderActivity();
    });

    $("#activityDateFilter")?.addEventListener("change", e => {
      state.activityDateFilter = e.target.value;
      renderActivity();
    });

    $("#activitySearchInput")?.addEventListener("input", e => {
      state.activitySearchQuery = e.target.value;
      renderActivity();
    });

    $("#btnExportActivity")?.addEventListener("click", () => {
      const activity = db.data.activity;
      const accessibleRecords = activity.filter(a => {
        const matchRole = state.activityRoleFilter === "All" ||
          (a.role && a.role.toLowerCase() === state.activityRoleFilter.toLowerCase());

        const q = state.activitySearchQuery.toLowerCase().trim();
        const matchSearch = !q || (
          (a.action && a.action.toLowerCase().includes(q)) ||
          (a.user && a.user.toLowerCase().includes(q)) ||
          (a.actorId && a.actorId.toLowerCase().includes(q)) ||
          (a.record && a.record.toLowerCase().includes(q)) ||
          (a.id && a.id.toLowerCase().includes(q)) ||
          (a.role && a.role.toLowerCase().includes(q)) ||
          (a.recordType && a.recordType.toLowerCase().includes(q))
        );

        const matchDate = matchActivityDate(a.timestamp, state.activityDateFilter);
        return matchRole && matchSearch && matchDate;
      });

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        exportedExactTime: formatExactTimestamp(new Date()),
        exportedBy: "ADMIN (Limuel)",
        totalExported: accessibleRecords.length,
        filterCriteria: {
          searchQuery: state.activitySearchQuery || null,
          roleFilter: state.activityRoleFilter,
          dateFilter: state.activityDateFilter
        },
        auditRecords: accessibleRecords.map(rec => ({
          eventId: rec.id,
          timestamp: rec.timestamp,
          exactTime: rec.exactTime || formatExactTimestamp(rec.timestamp),
          relativeTime: calculateRelativeTime(rec.timestamp || rec.exactTime),
          actorId: rec.actorId,
          actorRole: rec.role,
          actorUser: rec.user,
          action: rec.action,
          relatedRecordId: rec.record,
          relatedRecordType: rec.recordType,
          changeDetails: rec.details || {}
        }))
      };

      const json = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hellosolar-audit-log-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${accessibleRecords.length} audit log record${accessibleRecords.length === 1 ? '' : 's'} to JSON`, "success", "↓");
    });

    // 16. Settings Events & Change Tracking
    $("#btnSaveSettings")?.addEventListener("click", saveSettings);

    const settingFieldSelectors = [
      "#setCompanyName", "#setTimezone", "#setCurrency", "#setEmail",
      "#setDirectTeam", "#setMaxDirect", "#setDirectConfirm",
      "#setOverdueDays", "#setDelayDays", "#setDocHours"
    ];

    settingFieldSelectors.forEach(selector => {
      const el = $(selector);
      if (el) {
        el.addEventListener("input", checkSettingsDirtyState);
        el.addEventListener("change", checkSettingsDirtyState);
      }
    });

    // Separated Developer Tools & Reset Confirmation
    $("#btnResetDataModalOpen")?.addEventListener("click", () => {
      const input = $("#resetConfirmInput");
      const btn = $("#btnConfirmReset");
      if (input) input.value = "";
      if (btn) btn.disabled = true;
      $("#resetModal")?.classList.add("open");
      setTimeout(() => input?.focus(), 100);
    });

    $("#resetConfirmInput")?.addEventListener("input", e => {
      const typed = e.target.value.trim();
      const btn = $("#btnConfirmReset");
      if (btn) {
        btn.disabled = typed !== "RESET DEMO DATA";
      }
    });

    $("#btnConfirmReset")?.addEventListener("click", () => {
      const input = $("#resetConfirmInput");
      if (!input || input.value.trim() !== "RESET DEMO DATA") {
        showToast("Please type RESET DEMO DATA exactly to proceed.", "warn", "⚠️");
        return;
      }

      // Local demo: clear every Hello Solar record kept in this browser (applications, documents, agreements,
      // payments, inquiries, notifications, portal data), then reload so every portal starts from the clean
      // sample data. The Super Admin sign-in (session storage) stays.
      if (window.HS_CONFIG && window.HS_CONFIG.isApi) {
        showToast("Demo reset is available in local demo mode only.", "warn", "⚠️");
        return;
      }
      try { localStorage.clear(); } catch (err) { db.reset(); }
      $("#btnConfirmReset").disabled = true;
      showToast("Demo data reset. Loading fresh sample data…", "success", "↺");
      setTimeout(() => window.location.reload(), 600);
    });

    // 17. Exports for Directory & Tickets
    $("#btnExportAccounts")?.addEventListener("click", openExportAccountsModal);
    $("#btnExecuteExportAccounts")?.addEventListener("click", executeExportAccounts);

    $("#btnExportSupport")?.addEventListener("click", () => {
      const json = JSON.stringify(db.data.support, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hellosolar-support-tickets-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Support tickets exported to JSON", "success", "↓");
    });
  }

  // --- INITIALIZATION ---
  function initTableRowLimits() {
    const limit = 5;
    const tables = new WeakMap();
    let nextId = 0;

    function update(table, reset = false) {
      let entry = tables.get(table);
      if (!entry) {
        if (!table.id) table.id = `expandable-table-${++nextId}`;
        const footer = document.createElement('div');
        footer.className = 'panel-footer-action table-row-toggle';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-toggle-see-more';
        button.setAttribute('aria-controls', table.id);
        footer.append(button);
        (table.closest('.table-container') || table).after(footer);
        entry = { footer, button, expanded: false };
        tables.set(table, entry);
        button.addEventListener('click', () => {
          entry.expanded = !entry.expanded;
          update(table);
          // Keep the control visible after collapsing a long table.
          if (!entry.expanded) button.scrollIntoView({ block: 'nearest' });
        });
      }
      if (reset) entry.expanded = false;
      const rows = [...table.tBodies].flatMap(body => [...body.rows]);
      const dataRows = rows.filter(row => !(row.cells.length === 1 && row.cells[0].colSpan > 1));
      dataRows.forEach((row, index) => {
        row.classList.toggle('table-row-collapsed', !entry.expanded && index >= limit);
      });
      entry.footer.hidden = dataRows.length <= limit;
      entry.button.setAttribute('aria-expanded', String(entry.expanded));
      entry.button.textContent = entry.expanded ? 'See Less' : `See More (${dataRows.length - limit} more)`;
    }

    document.querySelectorAll('table').forEach(table => update(table));
    // Renderers replace table bodies when filtering, switching tabs, or refreshing records.
    // Watch row content only, so our visibility and button updates cannot retrigger this work.
    new MutationObserver(mutations => {
      const changed = new Set();
      mutations.forEach(mutation => {
        const body = mutation.target.closest?.('tbody');
        if (body) changed.add(body.closest('table'));
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.matches('table')) changed.add(node);
          node.querySelectorAll('table').forEach(table => changed.add(table));
          if (node.matches('tbody')) changed.add(node.closest('table'));
        });
      });
      changed.forEach(table => {
        if (table?.isConnected) update(table, true);
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ==========================================================================
  // DIRECT INSTALLATION ENGINEER
  // ==========================================================================
  // Only workflow action allowed from the read-only Applications drawer
  function renderDrawerEngineerActions(app) {
    const box = $("#drawerEngineerActions");
    if (!box) return;
    if (!IS_ENGINEER) { box.innerHTML = ""; return; }
    const job = db.getDirectInstallJobs().find(j => j.appId === app.id);
    if (!job) { box.innerHTML = ""; return; }
    const dState = db.getDirectJobState(job);
    const label = dState === "pending" ? "Review & Accept Job" : (["completed", "active"].includes(dState) ? "View Installation Progress" : "Update Installation Progress");
    box.innerHTML = `<button class="btn btn-primary btn-sm" data-engineer-open-job="${safeText(job.id)}">${label}</button>`;
  }
  function applyRoleRestrictions() {
    if (IS_ACCOUNTING) {
      document.body.classList.add("role-accounting");
      const name = SESSION.name || "Accounting";
      $$(".user-avatar").forEach(el => { el.textContent = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "AC"; });
      $$(".user-name, .user-dropdown-name").forEach(el => { el.textContent = name; });
      $$(".user-role, .user-dropdown-role").forEach(el => { el.textContent = "Accounting"; });
      $("#userProfileBtn")?.setAttribute("title", "Accounting Account");
      return;
    }
    if (!IS_ENGINEER) return;
    document.body.classList.add("role-direct-engineer");
    const initials = ENGINEER.name.replace(/^Engr\.\s*/i, "").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    $$(".user-avatar").forEach(el => { el.textContent = initials || "DE"; });
    $$(".user-name, .user-dropdown-name").forEach(el => { el.textContent = ENGINEER.name; });
    $$(".user-role, .user-dropdown-role").forEach(el => { el.textContent = "Installation Engineer"; });
    $("#userProfileBtn")?.setAttribute("title", "Installation Engineer Account");
  }

  const DE_STATE_LABEL = {
    pending: "Awaiting Engineer Acceptance",
    accepted: "Awaiting Installation",
    in_progress: "Installation In Progress",
    completed: "Installation Completed · Ready to Activate",
    active: "System Active"
  };

  function deShowAlert(message, type = "error") {
    const el = $("#deAlert");
    if (!el) return;
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
  }

  function deRenderReadOnly(readOnly) {
    const form = $("#deForm");
    if (!form) return;
    form.classList.toggle("is-readonly", readOnly);
    form.querySelectorAll(".form-group").forEach(group => {
      const control = group.querySelector("input, select, textarea");
      if (!control) return;
      let ro = group.querySelector(".de-ro");
      if (!readOnly) { if (ro) ro.remove(); return; }
      if (!ro) {
        ro = document.createElement("div");
        ro.className = "de-ro";
        control.insertAdjacentElement("afterend", ro);
      }
      let value = String(control.value || "").trim();
      if (control.id === "dePercent") value = `${parseInt(value, 10) || 0}%`;
      else if (value && control.dataset.unit) value = `${value} ${control.dataset.unit}`;
      ro.textContent = value || "Not provided";
      ro.classList.toggle("is-empty", !value);
    });
  }

  function openDirectEngineerModal(jobId) {
    const job = db.data.installations.find(j => j.id === jobId);
    if (!job || job.installerType !== "Hello Solar Direct") return;
    const rec = db.getInstallationProgress(job);
    const dState = db.getDirectJobState(job);
    const editable = dState === "accepted" || dState === "in_progress";

    $("#deJobId").value = job.id;
    $("#deEyebrow").textContent = `DIRECT INSTALLATION / ${DE_STATE_LABEL[dState] || job.status}`.toUpperCase();
    $("#deTitle").textContent = `${job.id} • ${job.customer}`;
    $("#deIds").textContent = `${job.id} · ${job.appId}`;
    const pill = $("#deStatusPill");
    pill.textContent = DE_STATE_LABEL[dState] || job.status;
    pill.className = `status-pill ${getStatusClass(dState === "active" || dState === "completed" ? "Completed" : job.status)}`;
    $("#deCustomer").textContent = job.customer || "—";
    $("#deSystem").textContent = `${job.system || "—"} · ${job.location || "—"}`;

    $("#deReference").value = rec.referenceNumber || "";
    $$("#deForm [data-group][data-key]").forEach(el => { el.value = (rec[el.dataset.group] || {})[el.dataset.key] ?? ""; });
    $("#dePercent").value = rec.progress.percent ?? 0;
    $("#deStage").value = rec.progress.stage || "";
    $("#deNotes").value = rec.progress.notes || "";
    $("#deProgressBar").style.width = `${Math.min(100, rec.progress.percent || 0)}%`;

    // Editable only after acceptance and before completion; pending jobs are locked until accepted
    $$("#deForm input, #deForm select, #deForm textarea").forEach(el => { el.disabled = !editable; });
    deRenderReadOnly(dState === "completed" || dState === "active");

    const hints = {
      pending: "Accept this assigned job to start recording the Reference Number, equipment, and installation progress.",
      accepted: "Save the Reference Number and equipment details. Setting progress above 0% starts the installation.",
      in_progress: "Update progress as work continues. Use Complete Installation to finish (100%).",
      completed: "Installation completed. Activate the system once commissioning is confirmed. Details are view only.",
      active: "System is active. Installation details are view only."
    };
    $("#deHint").textContent = hints[dState] || "";
    $("#deLastUpdated").textContent = rec.updatedAt
      ? `Last updated ${new Date(rec.updatedAt).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}${rec.updatedBy?.name ? ` by ${rec.updatedBy.name}` : ""}`
      : "No progress saved yet.";

    $("#deBtnAccept").hidden = dState !== "pending";
    $("#deBtnSave").hidden = !editable;
    $("#deBtnComplete").hidden = dState !== "in_progress";
    $("#deBtnActivate").hidden = dState !== "completed";

    deShowAlert("");
    $("#directEngineerModal")?.classList.add("open");
  }

  function deCollectPayload() {
    const payload = {
      referenceNumber: $("#deReference").value,
      battery: {}, inverter: {}, solarPanels: {},
      progress: { percent: $("#dePercent").value, stage: $("#deStage").value, notes: $("#deNotes").value }
    };
    $$("#deForm [data-group][data-key]").forEach(el => { payload[el.dataset.group][el.dataset.key] = el.value; });
    return payload;
  }

  function deAfterAction(result, jobId, successMsg) {
    if (!result.success) {
      deShowAlert(result.message || "Action could not be completed.");
      return;
    }
    db.save();
    showToast(successMsg, "success", "✓");
    renderCurrentPage();
    openDirectEngineerModal(jobId);
    deShowAlert(successMsg, "success");
  }

  function wireDirectEngineerEvents() {
    const jobIdOf = () => $("#deJobId")?.value;
    document.addEventListener("click", e => {
      const btn = e.target.closest("[data-engineer-open-job]");
      if (!btn || !IS_ENGINEER) return;
      $("#appDrawerOverlay")?.classList.remove("open");
      openDirectEngineerModal(btn.dataset.engineerOpenJob);
    });
    $("#deBtnAccept")?.addEventListener("click", () => {
      const jobId = jobIdOf();
      deAfterAction(db.engineerAcceptJob(jobId, ENGINEER), jobId, `Accepted direct installation ${jobId}`);
    });
    $("#deBtnSave")?.addEventListener("click", () => {
      const jobId = jobIdOf();
      deAfterAction(db.saveDirectInstallationProgress(jobId, deCollectPayload(), ENGINEER), jobId, "Installation progress saved");
    });
    $("#deBtnComplete")?.addEventListener("click", () => {
      const jobId = jobIdOf();
      // Save the latest edits first, then complete
      const saved = db.saveDirectInstallationProgress(jobId, deCollectPayload(), ENGINEER);
      if (!saved.success) { deShowAlert(saved.message); return; }
      deAfterAction(db.engineerCompleteInstallation(jobId, ENGINEER), jobId, `Installation ${jobId} completed`);
    });
    $("#deBtnActivate")?.addEventListener("click", () => {
      const jobId = jobIdOf();
      deAfterAction(db.engineerActivateSystem(jobId, ENGINEER), jobId, `System activated for ${jobId}`);
    });
    $("#dePercent")?.addEventListener("input", e => {
      $("#deProgressBar").style.width = `${Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0))}%`;
    });
  }

  // Super Admin monitor: read-only Installation Progress summary in Inspect / Update modal
  function renderInstallProgressMonitor(job) {
    const box = $("#imInstallProgressSummary");
    if (!box) return;
    const app = db.data.applications.find(a => a.id === job.appId);
    let hasRecord = !!app?.installationProgress;
    if (!hasRecord) {
      try { hasRecord = !!(window.HSShared ? window.HSShared.installationProgressFor(job.appId) : (JSON.parse(localStorage.getItem("hello_solar_installation_progress") || "{}") || {})[job.appId]); } catch { hasRecord = false; }
    }
    if (!hasRecord || job.installerType === "Maintenance") { box.style.display = "none"; box.innerHTML = ""; return; }
    const rec = db.getInstallationProgress(job);
    const v = x => safeText(String(x ?? "").trim() || "Not provided");
    const eq = (o, keys) => keys.map(k => String(o?.[k] ?? "").trim()).filter(Boolean).join(" · ") || "Not provided";
    const updated = rec.updatedAt
      ? new Date(rec.updatedAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + (rec.updatedBy?.name ? " · " + rec.updatedBy.name : "")
      : "Not provided";
    box.innerHTML = `
      <label class="form-label">Installation Progress (${safeText(rec.appId)})</label>
      <div class="de-monitor-grid">
        <div><span>Reference Number</span><strong>${v(rec.referenceNumber)}</strong></div>
        <div><span>Progress</span><strong>${safeText(rec.progress.percent || 0)}%${rec.progress.stage ? " · " + safeText(rec.progress.stage) : ""}</strong></div>
        <div><span>Solar Panels</span><strong>${safeText(eq(rec.solarPanels, ["brand", "model", "quantity"]))}</strong></div>
        <div><span>Inverter</span><strong>${safeText(eq(rec.inverter, ["brand", "model", "serialNumber"]))}</strong></div>
        <div><span>Battery</span><strong>${safeText(eq({ ...rec.battery, capacityKwh: rec.battery.capacityKwh ? `${rec.battery.capacityKwh} kWh` : "" }, ["brand", "model", "capacityKwh"]))}</strong></div>
        <div><span>Last Updated</span><strong>${safeText(updated)}</strong></div>
        ${rec.progress.notes ? `<div style="grid-column:1/-1;"><span>Notes</span><strong>${safeText(rec.progress.notes)}</strong></div>` : ""}
      </div>`;
    box.style.display = "block";
  }

  function init() {
    if (!window.SuperAdminAuth.isSignedIn()) return;
    applyRoleRestrictions();
    wireEvents();
    wireSiteVisitAndAccountingEvents();
    wireDirectEngineerEvents();
    initTableRowLimits();
    window.addEventListener('storage', event => {
      if (event.key !== 'HELLO_SOLAR_SUPER_ADMIN_DATA_V2') return;
      db.data = db.load();
      window.HELLO_SOLAR_DATA = db.data;
      updateBadgesAndKPIs();
      if (state.currentPage !== 'create-account') renderCurrentPage();
    });

    // Check initial hash route
    const hash = window.location.hash.replace("#", "").trim();
    if (hash && $(`#page-${hash}`)) {
      go(hash);
    } else {
      go(IS_ACCOUNTING ? "accounting" : IS_ENGINEER ? "installations" : "overview", IS_ENGINEER ? "direct" : null);
    }

    // Daily due-date reminders to customers (7 days, 1 day and on the due date; each sent once)
    try {
      if (window.HSShared && typeof window.HSShared.sendDueReminders === "function") {
        (db.data.applications || []).forEach(a => db.getPaymentSchedule(a.id));
        db.save();
        window.HSShared.sendDueReminders();
      }
    } catch (e) { /* reminders are best effort */ }
  }

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
