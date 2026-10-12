// 1. Initialize Lucide icons
lucide.createIcons();

// 2. Mobile & Tablet Navigation Drawer Controller
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');
const mobileMenuBackdrop = document.getElementById('mobileMenuBackdrop');
const burgerLine1 = document.getElementById('burgerLine1');
const burgerLine2 = document.getElementById('burgerLine2');
const burgerLine3 = document.getElementById('burgerLine3');
let isMobileMenuOpen = false;

function toggleMobileMenu(forceState) {
    isMobileMenuOpen = (forceState !== undefined) ? forceState : !isMobileMenuOpen;
    if (!mobileMenuBtn || !mobileMenu) return;

    mobileMenuBtn.setAttribute('aria-expanded', isMobileMenuOpen);

    if (isMobileMenuOpen) {
        document.body.style.overflow = 'hidden';

        if (mobileMenuBackdrop) {
            mobileMenuBackdrop.classList.remove('pointer-events-none', 'opacity-0');
            mobileMenuBackdrop.classList.add('opacity-100');
        }

        mobileMenu.classList.remove('pointer-events-none', '-translate-y-4', 'scale-98', 'opacity-0');
        mobileMenu.classList.add('translate-y-0', 'scale-100', 'opacity-100');

        // Morph '☰' into 'X'
        if (burgerLine1) burgerLine1.style.transform = 'translateY(6.5px) rotate(45deg)';
        if (burgerLine2) {
            burgerLine2.style.opacity = '0';
            burgerLine2.style.transform = 'scaleX(0)';
        }
        if (burgerLine3) burgerLine3.style.transform = 'translateY(-6.5px) rotate(-45deg)';
    } else {
        document.body.style.overflow = '';

        if (mobileMenuBackdrop) {
            mobileMenuBackdrop.classList.add('pointer-events-none', 'opacity-0');
            mobileMenuBackdrop.classList.remove('opacity-100');
        }

        mobileMenu.classList.add('pointer-events-none', '-translate-y-4', 'scale-98', 'opacity-0');
        mobileMenu.classList.remove('translate-y-0', 'scale-100', 'opacity-100');

        // Morph 'X' back into '☰'
        if (burgerLine1) burgerLine1.style.transform = 'translateY(0px) rotate(0deg)';
        if (burgerLine2) {
            burgerLine2.style.opacity = '1';
            burgerLine2.style.transform = 'scaleX(1)';
        }
        if (burgerLine3) burgerLine3.style.transform = 'translateY(0px) rotate(0deg)';
    }
}

if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMobileMenu();
    });
}

if (mobileMenuBackdrop) {
    mobileMenuBackdrop.addEventListener('click', () => {
        toggleMobileMenu(false);
    });
}

document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => {
        toggleMobileMenu(false);
    });
});

document.addEventListener('click', (e) => {
    if (isMobileMenuOpen && mobileMenu && !mobileMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
        toggleMobileMenu(false);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (isMobileMenuOpen) toggleMobileMenu(false);
        closeModal('recommendationModal');
    }
});

// 3. Partner Inquiries
// Saved to a shared queue for Super Admin → Contact Inquiries (backend-ready: POST the same record to an
// API later). No account is created here; partners describe their business (Financer / Installer / Merchant)
// in the Message, and Super Admin picks the account role when creating the account after approval.
const PARTNER_INQUIRY_KEY = 'HELLO_SOLAR_PARTNER_INQUIRIES';

// Inquiry Type selector: Customer / Partner.
// The hidden #companyName select stays the single source of truth ("" = Customer, "Partner" = Partner).
const INQUIRY_COPY = {
    '': { placeholder: 'Tell us about your home and your monthly electric bill.', submit: 'Send Message' },
    Partner: { placeholder: 'Tell us about your business (financing, installation or products) and how you would like to partner.', submit: 'Send Partner Inquiry' }
};

// Left-side contact cards follow the Inquiry Type (Customer / Partner)
const CONTACT_DETAILS = {
    customer: {
        callLabel: 'Call Our Solar Specialists',
        callValue: '(02) 8888-SOLAR / +63 917 123 4567',
        callHref: 'tel:+63288887652',
        callNote: 'Monday to Saturday: 8:00 AM – 6:00 PM',
        emailLabel: 'Direct Email Inquiries',
        emailValue: 'hello@hellosolar.ph',
        emailNote: 'We respond to all requests within 24 business hours',
        areaLabel: 'Headquarters & Service Areas',
        areaValue: 'Metro Manila & Nationwide Philippines',
        areaNote: 'Residential, Commercial, and Estate installations'
    },
    // Replace with the partnerships team's own number / email when available
    partner: {
        callLabel: 'Call Our Partnerships Team',
        callValue: '(02) 8888-SOLAR / +63 917 123 4567',
        callHref: 'tel:+63288887652',
        callNote: 'Monday to Friday: 9:00 AM – 5:00 PM',
        emailLabel: 'Partnership Inquiries',
        emailValue: 'partners@hellosolar.ph',
        emailNote: 'Proposals are reviewed within 2–3 business days',
        areaLabel: 'Partnership Programs',
        areaValue: 'Financers, Installers & Merchants',
        areaNote: 'Join our nationwide Hello Solar partner network'
    }
};
let renderedContactGroup = 'customer';

function renderContactDetails(group) {
    if (group === renderedContactGroup) return;
    renderedContactGroup = group;
    const d = CONTACT_DETAILS[group];
    document.querySelectorAll('[data-contact]').forEach(el => {
        const key = el.getAttribute('data-contact');
        if (!(key in d)) return;
        el.textContent = d[key];
        if (key === 'callValue') el.setAttribute('href', d.callHref);
        if (key === 'emailValue') el.setAttribute('href', 'mailto:' + d.emailValue);
        el.classList.remove('contact-swap');
        void el.offsetWidth; // restart the fade
        el.classList.add('contact-swap');
    });
}

function isPartnerInquiry() {
    return document.getElementById('companyName').value === 'Partner';
}

function renderInquiryType() {
    const isPartner = isPartnerInquiry();
    document.querySelectorAll('#inquiryTypeOptions .inquiry-type-option').forEach(btn => {
        const active = (btn.getAttribute('data-group') === 'partner') === isPartner;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1;
    });
    renderContactDetails(isPartner ? 'partner' : 'customer');
    const copy = INQUIRY_COPY[isPartner ? 'Partner' : ''];
    const msg = document.getElementById('message');
    if (msg) msg.placeholder = copy.placeholder;
    const submitLabel = document.getElementById('submitContactLabel');
    if (submitLabel) submitLabel.textContent = copy.submit;
}

// Top-level choice: "customer" or "partner"
function setInquiryGroup(group) {
    const select = document.getElementById('companyName');
    const value = group === 'partner' ? 'Partner' : '';
    if (select.value !== value) {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    renderInquiryType();
}

(function initInquiryType() {
    const ARROWS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const group = document.getElementById('inquiryTypeOptions');
    if (!group) return;
    group.addEventListener('click', (e) => {
        const btn = e.target.closest('.inquiry-type-option');
        if (btn) setInquiryGroup(btn.getAttribute('data-group'));
    });
    group.addEventListener('keydown', (e) => {
        const dir = ARROWS[e.key];
        if (!dir) return;
        e.preventDefault();
        const list = Array.from(group.querySelectorAll('.inquiry-type-option'));
        const idx = list.findIndex(b => b.classList.contains('is-active'));
        const next = list[idx < 0 ? 0 : (idx + dir + list.length) % list.length];
        setInquiryGroup(next.getAttribute('data-group'));
        next.focus();
    });
    renderInquiryType();
})();

// Phone: digits (and spaces) only — letters and symbols are removed as they are typed or pasted
document.getElementById('phone')?.addEventListener('input', (e) => {
    const clean = e.target.value.replace(/[^\d ]/g, '');
    if (clean !== e.target.value) e.target.value = clean;
});

// Inline validation for the contact fields (replaces browser pop-ups)
const CONTACT_FIELDS = ['firstName', 'lastName', 'email', 'phone'];

function contactFieldError(id) {
    const value = (document.getElementById(id)?.value || '').trim();
    if (id === 'firstName') return value ? '' : 'Please enter your first name.';
    if (id === 'lastName') return value ? '' : 'Please enter your last name.';
    if (id === 'email') {
        if (!value) return 'Please enter your email.';
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : 'Enter a valid email address.';
    }
    if (id === 'phone') {
        if (!value) return 'Please enter your phone number.';
        const digits = value.replace(/\D/g, '');
        return digits.length >= 7 && digits.length <= 15 ? '' : 'Enter a valid phone number.';
    }
    return '';
}

function setContactError(id, message) {
    const input = document.getElementById(id);
    const err = document.getElementById(id + 'Error');
    if (input) {
        input.classList.toggle('is-invalid', !!message);
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
    if (err) {
        err.textContent = message || '';
        err.classList.toggle('hidden', !message);
    }
}

function validateContactFields() {
    let first = null;
    CONTACT_FIELDS.forEach(id => {
        const msg = contactFieldError(id);
        setContactError(id, msg);
        if (msg && !first) first = document.getElementById(id);
    });
    if (first) first.focus();
    return !first;
}

CONTACT_FIELDS.forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => {
        if (input.classList.contains('is-invalid') && !contactFieldError(id)) setContactError(id, '');
    });
    input.addEventListener('blur', () => {
        if (input.value.trim()) setContactError(id, contactFieldError(id));
    });
});

function renderContactSuccess(isPartner) {
    const badge = document.getElementById('contactSuccessBadge');
    const intro = document.getElementById('contactSuccessIntro');
    const steps = document.getElementById('contactNextSteps');
    if (badge) badge.textContent = isPartner ? 'Partner Inquiry Received' : 'Message Sent';
    if (intro) intro.textContent = isPartner
        ? 'Your partnership inquiry is now with our team for review.'
        : 'We have received your message.';
    const list = isPartner
        ? ['Our team reviews your partnership inquiry', 'We contact you to confirm details', 'Your partner account is set up after approval']
        : ['Review of your home usage profile', 'Personalized solar proposal & savings breakdown', 'Complimentary rooftop irradiance scan'];
    if (steps) {
        steps.innerHTML = list.map((t, i) => `
            <li class="text-xs font-semibold text-stone-700 flex items-start gap-2">
                <span class="text-amber-600 font-bold">${i + 1}.</span><span>${t}</span>
            </li>`).join('');
    }
}

function savePartnerInquiry(fields) {
    const now = new Date();
    const fullName = `${fields.firstName} ${fields.lastName}`.trim();
    const record = {
        id: `PINQ-${now.getTime()}`,
        inquiryType: 'Partner',
        // No partner type on the form — Super Admin chooses the role (from the message) when creating the account
        partnerType: '',
        source: 'Landing Page — Contact Us',
        name: fullName,
        firstName: fields.firstName,
        lastName: fields.lastName,
        email: fields.email,
        phone: fields.phone,
        location: fields.country,
        country: fields.country,
        category: 'Partner',
        subject: 'Partnership Inquiry',
        message: fields.message,
        financerProposal: null,
        status: 'Unread',
        inquiryStatus: 'Pending Review',
        timestamp: now.toISOString(),
        accountCreated: false,
        // Field names match Super Admin → Create Account for prefill after approval
        createAccountPrefill: {
            firstName: fields.firstName,
            lastName: fields.lastName,
            email: fields.email,
            phone: fields.phone
        }
    };
    // api mode (shared/hello-solar-config.js): POST /public/inquiries — the backend stores the inquiry,
    // applies the duplicate rule and assigns the final ID (shown in Super Admin → Contact Inquiries)
    if (window.HS_CONFIG && window.HS_CONFIG.isApi && window.HSApi) {
        window.HSApi.command('inquiry.submit', { inquiry: record }, { auth: false });
        return record;
    }
    try {
        const list = JSON.parse(localStorage.getItem(PARTNER_INQUIRY_KEY) || '[]');
        const queue = Array.isArray(list) ? list : [];
        // Duplicate guard (same concept as customer inquiries): same id, or the same partner request
        // re-sent within 2 minutes. Returns the existing inquiry instead of adding a second one.
        const fingerprint = r => [r.source, r.inquiryType, r.email, r.phone, r.message]
            .map(v => String(v || '').trim().toLowerCase()).join('|');
        const fp = fingerprint(record);
        const nowMs = Date.parse(record.timestamp) || Date.now();
        const existing = queue.find(r => r && (r.id === record.id ||
            (fingerprint(r) === fp && Math.abs(nowMs - (Date.parse(r.timestamp) || 0)) < 120000)));
        if (existing) return existing;
        queue.unshift(record);
        localStorage.setItem(PARTNER_INQUIRY_KEY, JSON.stringify(queue));
    } catch (err) {
        console.warn('Could not save partner inquiry:', err);
    }
    return record;
}


// Customer inquiry → Super Admin → Contact Inquiries (shared queue, imported once by id).
// Backend-ready: POST the same record to an API later.
const CUSTOMER_INQUIRY_KEY = 'HELLO_SOLAR_CUSTOMER_INQUIRIES';

function queueCustomerInquiry(record) {
    // api mode (shared/hello-solar-config.js): POST /public/inquiries — the backend stores the inquiry,
    // applies the duplicate rule and assigns the final ID (shown in Super Admin → Contact Inquiries)
    if (window.HS_CONFIG && window.HS_CONFIG.isApi && window.HSApi) {
        window.HSApi.command('inquiry.submit', { inquiry: record }, { auth: false });
        return true;
    }
    try {
        const list = JSON.parse(localStorage.getItem(CUSTOMER_INQUIRY_KEY) || '[]');
        const queue = Array.isArray(list) ? list : [];
        // Duplicate guard: same id, or the same request re-sent within 2 minutes
        const fingerprint = r => [r.source, r.email, r.phone, r.package, r.paymentPreference, r.message]
            .map(v => String(v || '').trim().toLowerCase()).join('|');
        const fp = fingerprint(record);
        const now = Date.parse(record.timestamp) || Date.now();
        const duplicate = queue.some(r => r && (r.id === record.id ||
            (fingerprint(r) === fp && Math.abs(now - (Date.parse(r.timestamp) || 0)) < 120000)));
        if (duplicate) return false;
        queue.unshift(record);
        localStorage.setItem(CUSTOMER_INQUIRY_KEY, JSON.stringify(queue));
        return true;
    } catch (err) {
        console.warn('Could not queue customer inquiry:', err);
        return false;
    }
}

// 3b. Contact Form Submission Handler
function handleContactSubmit(e) {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const country = document.getElementById('country').value;
    const companyName = document.getElementById('companyName').value.trim();
    const message = document.getElementById('message').value.trim();

    if (!validateContactFields()) return;

    const isPartner = companyName === 'Partner';
    if (isPartner) {
        savePartnerInquiry({ firstName, lastName, email, phone, country, message });
    } else {
        // Customer inquiry → Super Admin → Contact Inquiries
        const ts = new Date();
        queueCustomerInquiry({
            id: `INQ-CU${ts.getTime()}`,
            inquiryType: 'Customer',
            source: 'Landing Page — Contact Us',
            name: `${firstName} ${lastName}`.trim(),
            firstName,
            lastName,
            email,
            phone,
            location: country,
            country,
            category: 'Residential Solar',
            paymentPreference: 'Not specified',
            subject: 'Contact Us Message',
            message,
            status: 'Unread',
            inquiryStatus: 'Not Sent',
            customerResponse: 'Awaiting Response',
            confirmationEmailSentAt: null,
            timestamp: ts.toISOString()
        });
    }

    const submitBtn = document.getElementById('submitContactBtn');
    const originalBtnHTML = submitBtn.innerHTML;

    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-[#1C1917]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Sending Message...</span>
    `;

    setTimeout(() => {
        const formEl = document.getElementById('contactUsForm');
        const successEl = document.getElementById('contactSuccessScreen');
        const successNameEl = document.getElementById('successLeadName');
        const successContactEl = document.getElementById('successLeadContact');

        if (successNameEl) successNameEl.textContent = firstName || 'there';
        renderContactSuccess(isPartner);
        if (successContactEl) successContactEl.textContent = email || phone;

        if (formEl) formEl.classList.add('hidden');
        if (successEl) {
            successEl.classList.remove('hidden');
            lucide.createIcons();
        }

        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHTML;
    }, 600);
}

// Custom Dropdown Engine (Design, Size & Font Matched)
function setupCustomSelect(containerId, selectId, triggerId, labelId, menuId) {
    const container = document.getElementById(containerId);
    const select = document.getElementById(selectId);
    const trigger = document.getElementById(triggerId);
    const label = document.getElementById(labelId);
    const menu = document.getElementById(menuId);
    if (!container || !select || !trigger || !label || !menu) return;

    function close() {
        menu.classList.add('hidden');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.classList.remove('border-[#F59E0B]', 'ring-4', 'ring-amber-500/15', 'bg-white');
        const arrow = trigger.querySelector('.chevron-arrow');
        if (arrow) arrow.classList.remove('rotate-180');
    }

    function open() {
        document.querySelectorAll('.hs-custom-menu').forEach(m => {
            if (m !== menu) m.classList.add('hidden');
        });
        document.querySelectorAll('.hs-custom-trigger').forEach(t => {
            if (t !== trigger) {
                t.setAttribute('aria-expanded', 'false');
                t.classList.remove('border-[#F59E0B]', 'ring-4', 'ring-amber-500/15', 'bg-white');
                const a = t.querySelector('.chevron-arrow');
                if (a) a.classList.remove('rotate-180');
            }
        });

        menu.classList.remove('hidden');
        trigger.setAttribute('aria-expanded', 'true');
        trigger.classList.add('border-[#F59E0B]', 'ring-4', 'ring-amber-500/15', 'bg-white');
        const arrow = trigger.querySelector('.chevron-arrow');
        if (arrow) arrow.classList.add('rotate-180');
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = trigger.getAttribute('aria-expanded') === 'true';
        if (isOpen) close();
        else open();
    });

    menu.querySelectorAll('.hs-custom-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = btn.getAttribute('data-value');
            const txt = btn.querySelector('.option-text').textContent;

            select.value = val;
            select.dispatchEvent(new Event('change', { bubbles: true }));

            label.textContent = txt;
            label.classList.remove('text-[#8A827B]');
            label.classList.add('text-[#1C1917]');

            menu.querySelectorAll('.hs-custom-option').forEach(b => {
                b.classList.remove('bg-amber-100/90', 'text-amber-950', 'font-bold');
                b.classList.add('text-[#1C1917]', 'font-semibold');
                const check = b.querySelector('.option-check');
                if (check) check.classList.add('hidden');
            });

            btn.classList.add('bg-amber-100/90', 'text-amber-950', 'font-bold');
            btn.classList.remove('text-[#1C1917]', 'font-semibold');
            const check = btn.querySelector('.option-check');
            if (check) check.classList.remove('hidden');

            close();
        });
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) close();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
}

setupCustomSelect('countryDropdownContainer', 'country', 'countryCustomTrigger', 'countryTriggerLabel', 'countryCustomMenu');

function resetContactForm() {
    const formEl = document.getElementById('contactUsForm');
    const successEl = document.getElementById('contactSuccessScreen');

    if (formEl) {
        formEl.reset();

        // Reset Country custom select
        const countryLabel = document.getElementById('countryTriggerLabel');
        const countryMenu = document.getElementById('countryCustomMenu');
        if (countryLabel && countryMenu) {
            countryLabel.textContent = 'Philippines';
            countryLabel.classList.remove('text-[#8A827B]');
            countryLabel.classList.add('text-[#1C1917]');
            countryMenu.querySelectorAll('.hs-custom-option').forEach(b => {
                const isPhil = b.getAttribute('data-value') === 'Philippines';
                b.classList.toggle('bg-amber-100/90', isPhil);
                b.classList.toggle('text-amber-950', isPhil);
                b.classList.toggle('font-bold', isPhil);
                const check = b.querySelector('.option-check');
                if (check) check.classList.toggle('hidden', !isPhil);
            });
        }

        // Reset Inquiry Type to Customer and clear validation
        setInquiryGroup('customer');
        CONTACT_FIELDS.forEach(id => setContactError(id, ''));

        formEl.classList.remove('hidden');
    }
    if (successEl) {
        successEl.classList.add('hidden');
    }
}

// 4. Recommendation Modal & Wizard Engine
const wizardState = {
    step: 1,
    bill: '₱5,000–₱8,000',
    timeUsage: 'night',
    priority: 'maximum'
};

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
    });
    document.body.style.overflow = 'hidden';
    lucide.createIcons();
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }, 200);
}

function selectWizardCard(field, value, nextStep, cardEl) {
    wizardState[field] = value;
    if (cardEl && cardEl.parentElement) {
        cardEl.parentElement.querySelectorAll('.wizard-card').forEach(c => {
            c.setAttribute('aria-checked', 'false');
            c.classList.remove('border-amber-500', 'bg-amber-50/60', 'shadow-sm', 'ring-1', 'ring-amber-500/30');
            c.classList.add('border-[#E5E0D8]', 'bg-white');
            const mark = c.querySelector('.checkmark-circle');
            if (mark) {
                mark.classList.remove('bg-amber-500', 'border-amber-500', 'text-white', 'font-bold');
                mark.classList.add('text-transparent');
            }
        });
        cardEl.setAttribute('aria-checked', 'true');
        cardEl.classList.remove('border-[#E5E0D8]', 'bg-white');
        cardEl.classList.add('border-amber-500', 'bg-amber-50/60', 'shadow-sm', 'ring-1', 'ring-amber-500/30');
        const mark = cardEl.querySelector('.checkmark-circle');
        if (mark) {
            mark.classList.remove('text-transparent');
            mark.classList.add('bg-amber-500', 'border-amber-500', 'text-white', 'font-bold');
        }
    }

    setTimeout(() => {
        wizardState.step = nextStep;
        renderWizard();
    }, 180);
}

function renderWizard() {
    const container = document.getElementById('wizardContainer');
    if (!container) return;

    if (wizardState.step === 1) {
        container.innerHTML = `
            <div class="space-y-6">
                <div class="space-y-3">
                    <span class="text-[11px] font-black text-amber-700 uppercase tracking-wider">Step 1 of 3 &bull; Electric Bill</span>
                    <div class="w-full bg-stone-200/70 h-1.5 rounded-full overflow-hidden">
                        <div class="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-300 w-1/3"></div>
                    </div>
                    <div class="pt-1">
                        <h3 class="text-2xl sm:text-3xl font-black text-[#1C1917] tracking-tight">What is your average monthly electric bill?</h3>
                        <p class="text-xs sm:text-sm text-stone-500 font-semibold mt-1">Helps estimate your needed solar yield and monthly savings.</p>
                    </div>
                </div>

                <!-- Bill Options Cards -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5 pt-1" role="radiogroup">
                    <button type="button" role="radio" aria-checked="${wizardState.bill === '₱3,000–₱5,000'}"
                        onclick="selectWizardCard('bill', '₱3,000–₱5,000', 2, this)"
                        class="wizard-card min-h-[80px] p-3.5 sm:p-4 rounded-2xl border-2 text-left transition-all duration-200 flex flex-col justify-between relative group cursor-pointer ${wizardState.bill === '₱3,000–₱5,000' ? 'border-amber-500 bg-amber-50/60 shadow-sm ring-1 ring-amber-500/30' : 'border-[#E5E0D8] hover:border-amber-400 bg-white shadow-2xs'}">
                        <div class="flex items-center justify-between gap-1.5">
                            <span class="text-[15px] sm:text-base lg:text-[17px] font-black tracking-tight text-[#1C1917] whitespace-nowrap shrink-0">₱3,000&nbsp;&ndash;&nbsp;₱5,000</span>
                            <span class="w-5 h-5 shrink-0 rounded-full border border-stone-300 flex items-center justify-center text-xs checkmark-circle ${wizardState.bill === '₱3,000–₱5,000' ? 'bg-amber-500 border-amber-500 text-white font-bold' : 'text-transparent'}">✓</span>
                        </div>
                        <div class="text-[11px] sm:text-xs font-semibold text-stone-500 mt-2 flex items-center gap-1.5">
                            <span>1–2 ACs</span>
                            <span class="text-stone-300">&bull;</span>
                            <span>Starter home</span>
                        </div>
                    </button>

                    <button type="button" role="radio" aria-checked="${wizardState.bill === '₱5,000–₱8,000'}"
                        onclick="selectWizardCard('bill', '₱5,000–₱8,000', 2, this)"
                        class="wizard-card min-h-[80px] p-3.5 sm:p-4 rounded-2xl border-2 text-left transition-all duration-200 flex flex-col justify-between relative group cursor-pointer ${wizardState.bill === '₱5,000–₱8,000' ? 'border-amber-500 bg-amber-50/60 shadow-sm ring-1 ring-amber-500/30' : 'border-[#E5E0D8] hover:border-amber-400 bg-white shadow-2xs'}">
                        <div class="flex items-center justify-between gap-1.5">
                            <span class="text-[15px] sm:text-base lg:text-[17px] font-black tracking-tight text-[#1C1917] whitespace-nowrap shrink-0">₱5,000&nbsp;&ndash;&nbsp;₱8,000</span>
                            <span class="w-5 h-5 shrink-0 rounded-full border border-stone-300 flex items-center justify-center text-xs checkmark-circle ${wizardState.bill === '₱5,000–₱8,000' ? 'bg-amber-500 border-amber-500 text-white font-bold' : 'text-transparent'}">✓</span>
                        </div>
                        <div class="text-[11px] sm:text-xs font-semibold text-stone-500 mt-2 flex items-center gap-1.5">
                            <span class="text-amber-700 font-bold">⭐ Most Common</span>
                            <span class="text-stone-300">&bull;</span>
                            <span>2–3 ACs</span>
                        </div>
                    </button>

                    <button type="button" role="radio" aria-checked="${wizardState.bill === '₱8,000–₱12,000'}"
                        onclick="selectWizardCard('bill', '₱8,000–₱12,000', 2, this)"
                        class="wizard-card min-h-[80px] p-3.5 sm:p-4 rounded-2xl border-2 text-left transition-all duration-200 flex flex-col justify-between relative group cursor-pointer ${wizardState.bill === '₱8,000–₱12,000' ? 'border-amber-500 bg-amber-50/60 shadow-sm ring-1 ring-amber-500/30' : 'border-[#E5E0D8] hover:border-amber-400 bg-white shadow-2xs'}">
                        <div class="flex items-center justify-between gap-1.5">
                            <span class="text-[15px] sm:text-base lg:text-[17px] font-black tracking-tight text-[#1C1917] whitespace-nowrap shrink-0">₱8,000&nbsp;&ndash;&nbsp;₱12,000</span>
                            <span class="w-5 h-5 shrink-0 rounded-full border border-stone-300 flex items-center justify-center text-xs checkmark-circle ${wizardState.bill === '₱8,000–₱12,000' ? 'bg-amber-500 border-amber-500 text-white font-bold' : 'text-transparent'}">✓</span>
                        </div>
                        <div class="text-[11px] sm:text-xs font-semibold text-stone-500 mt-2 flex items-center gap-1.5">
                            <span>3–4 ACs</span>
                            <span class="text-stone-300">&bull;</span>
                            <span>High usage</span>
                        </div>
                    </button>

                    <button type="button" role="radio" aria-checked="${wizardState.bill === '₱12,000+'}"
                        onclick="selectWizardCard('bill', '₱12,000+', 2, this)"
                        class="wizard-card min-h-[80px] p-3.5 sm:p-4 rounded-2xl border-2 text-left transition-all duration-200 flex flex-col justify-between relative group cursor-pointer ${wizardState.bill === '₱12,000+' ? 'border-amber-500 bg-amber-50/60 shadow-sm ring-1 ring-amber-500/30' : 'border-[#E5E0D8] hover:border-amber-400 bg-white shadow-2xs'}">
                        <div class="flex items-center justify-between gap-1.5">
                            <span class="text-[15px] sm:text-base lg:text-[17px] font-black tracking-tight text-[#1C1917] whitespace-nowrap shrink-0">₱12,000+</span>
                            <span class="w-5 h-5 shrink-0 rounded-full border border-stone-300 flex items-center justify-center text-xs checkmark-circle ${wizardState.bill === '₱12,000+' ? 'bg-amber-500 border-amber-500 text-white font-bold' : 'text-transparent'}">✓</span>
                        </div>
                        <div class="text-[11px] sm:text-xs font-semibold text-stone-500 mt-2 flex items-center gap-1.5">
                            <span>4+ ACs</span>
                            <span class="text-stone-300">&bull;</span>
                            <span>Estate / Commercial</span>
                        </div>
                    </button>
                </div>
            </div>
        `;
    } else if (wizardState.step === 2) {
        container.innerHTML = `
            <div class="space-y-6">
                <div class="space-y-3">
                    <div class="flex items-center gap-2.5 pr-14">
                        <button onclick="wizardState.step = 1; renderWizard();" class="text-xs font-bold text-stone-600 hover:text-[#1C1917] flex items-center gap-1 transition bg-stone-100 hover:bg-amber-100/60 px-2.5 py-1 rounded-lg cursor-pointer">
                            &larr; Back
                        </button>
                        <span class="text-[11px] font-black text-amber-700 uppercase tracking-wider">Step 2 of 3 &bull; Power Habits</span>
                    </div>
                    <div class="w-full bg-stone-200/70 h-1.5 rounded-full overflow-hidden">
                        <div class="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-300 w-2/3"></div>
                    </div>
                    <div class="pt-1">
                        <h3 class="text-2xl sm:text-3xl font-black text-[#1C1917] tracking-tight">When does your home use the most power?</h3>
                        <p class="text-xs sm:text-sm text-stone-500 font-semibold mt-1">Determines if you need higher daytime solar output or larger battery storage.</p>
                    </div>
                </div>

                <div class="space-y-3 pt-1" role="radiogroup">
                    <button type="button" role="radio" aria-checked="${wizardState.timeUsage === 'day'}"
                        onclick="selectWizardCard('timeUsage', 'day', 3, this)"
                        class="wizard-card w-full p-3 sm:p-4 rounded-2xl border-2 text-left transition-all duration-200 flex items-center justify-between cursor-pointer ${wizardState.timeUsage === 'day' ? 'border-amber-500 bg-amber-50/60 shadow-sm ring-1 ring-amber-500/30' : 'border-[#E5E0D8] hover:border-amber-400 bg-white'}">
                        <div class="min-w-0 pr-2">
                            <div class="text-[13px] sm:text-base font-black text-[#1C1917] flex items-center gap-1.5 whitespace-nowrap">
                                <span class="whitespace-nowrap shrink-0">☀️ Daytime Heavy</span>
                            </div>
                            <div class="text-[11px] sm:text-xs text-stone-500 font-semibold mt-1 truncate">WFH, daytime ACs & appliances</div>
                        </div>
                        <span class="w-5 h-5 rounded-full border border-stone-300 shrink-0 ml-2 flex items-center justify-center text-xs checkmark-circle ${wizardState.timeUsage === 'day' ? 'bg-amber-500 border-amber-500 text-white font-bold' : 'text-transparent'}">✓</span>
                    </button>

                    <button type="button" role="radio" aria-checked="${wizardState.timeUsage === 'night'}"
                        onclick="selectWizardCard('timeUsage', 'night', 3, this)"
                        class="wizard-card w-full p-3 sm:p-4 rounded-2xl border-2 text-left transition-all duration-200 flex items-center justify-between cursor-pointer ${wizardState.timeUsage === 'night' ? 'border-amber-500 bg-amber-50/60 shadow-sm ring-1 ring-amber-500/30' : 'border-[#E5E0D8] hover:border-amber-400 bg-white'}">
                        <div class="min-w-0 pr-2">
                            <div class="text-[13px] sm:text-base font-black text-[#1C1917] flex items-center gap-1.5 whitespace-nowrap">
                                <span class="whitespace-nowrap shrink-0">🌙 Evening & Night</span>
                                <span class="text-[9.5px] sm:text-[10px] font-black text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0">⭐ Most Common</span>
                            </div>
                            <div class="text-[11px] sm:text-xs text-stone-500 font-semibold mt-1 truncate">Night ACs & evening home use</div>
                        </div>
                        <span class="w-5 h-5 rounded-full border border-stone-300 shrink-0 ml-2 flex items-center justify-center text-xs checkmark-circle ${wizardState.timeUsage === 'night' ? 'bg-amber-500 border-amber-500 text-white font-bold' : 'text-transparent'}">✓</span>
                    </button>

                    <button type="button" role="radio" aria-checked="${wizardState.timeUsage === 'balanced'}"
                        onclick="selectWizardCard('timeUsage', 'balanced', 3, this)"
                        class="wizard-card w-full p-3 sm:p-4 rounded-2xl border-2 text-left transition-all duration-200 flex items-center justify-between cursor-pointer ${wizardState.timeUsage === 'balanced' ? 'border-amber-500 bg-amber-50/60 shadow-sm ring-1 ring-amber-500/30' : 'border-[#E5E0D8] hover:border-amber-400 bg-white'}">
                        <div class="min-w-0 pr-2">
                            <div class="text-[13px] sm:text-base font-black text-[#1C1917] flex items-center gap-1.5 whitespace-nowrap">
                                <span class="whitespace-nowrap shrink-0">⚡ Balanced 24/7 Steady</span>
                            </div>
                            <div class="text-[11px] sm:text-xs text-stone-500 font-semibold mt-1 truncate">Steady high power use day & night</div>
                        </div>
                        <span class="w-5 h-5 rounded-full border border-stone-300 shrink-0 ml-2 flex items-center justify-center text-xs checkmark-circle ${wizardState.timeUsage === 'balanced' ? 'bg-amber-500 border-amber-500 text-white font-bold' : 'text-transparent'}">✓</span>
                    </button>
                </div>
            </div>
        `;
    } else if (wizardState.step === 3) {
        container.innerHTML = `
            <div class="space-y-6">
                <div class="space-y-3">
                    <div class="flex items-center gap-2.5 pr-14">
                        <button onclick="wizardState.step = 2; renderWizard();" class="text-xs font-bold text-stone-600 hover:text-[#1C1917] flex items-center gap-1 transition bg-stone-100 hover:bg-amber-100/60 px-2.5 py-1 rounded-lg cursor-pointer">
                            &larr; Back
                        </button>
                        <span class="text-[11px] font-black text-amber-700 uppercase tracking-wider">Step 3 of 3 &bull; Primary Goal</span>
                    </div>
                    <div class="w-full bg-stone-200/70 h-1.5 rounded-full overflow-hidden">
                        <div class="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-300 w-full"></div>
                    </div>
                    <div class="pt-1">
                        <h3 class="text-2xl sm:text-3xl font-black text-[#1C1917] tracking-tight">What is your primary goal with solar?</h3>
                        <p class="text-xs sm:text-sm text-stone-500 font-semibold mt-1">We customize your proposal to deliver exactly what matters most.</p>
                    </div>
                </div>

                <div class="space-y-3 pt-1" role="radiogroup">
                    <button type="button" role="radio" aria-checked="${wizardState.priority === 'savings'}"
                        onclick="selectWizardCard('priority', 'savings', 4, this)"
                        class="wizard-card w-full p-3 sm:p-4 rounded-2xl border-2 text-left transition-all duration-200 flex items-center justify-between cursor-pointer ${wizardState.priority === 'savings' ? 'border-amber-500 bg-amber-50/60 shadow-sm ring-1 ring-amber-500/30' : 'border-[#E5E0D8] hover:border-amber-400 bg-white'}">
                        <div class="min-w-0 pr-2">
                            <div class="text-[13px] sm:text-base font-black text-[#1C1917] flex items-center gap-1.5 whitespace-nowrap">
                                <span class="whitespace-nowrap shrink-0">💰 Maximum Bill Savings</span>
                            </div>
                            <div class="text-[11px] sm:text-xs text-stone-500 font-semibold mt-1 truncate">Fastest ROI to cut monthly power bills</div>
                        </div>
                        <span class="w-5 h-5 rounded-full border border-stone-300 shrink-0 ml-2 flex items-center justify-center text-xs checkmark-circle ${wizardState.priority === 'savings' ? 'bg-amber-500 border-amber-500 text-white font-bold' : 'text-transparent'}">✓</span>
                    </button>

                    <button type="button" role="radio" aria-checked="${wizardState.priority === 'maximum'}"
                        onclick="selectWizardCard('priority', 'maximum', 4, this)"
                        class="wizard-card w-full p-3 sm:p-4 rounded-2xl border-2 text-left transition-all duration-200 flex items-center justify-between cursor-pointer ${wizardState.priority === 'maximum' ? 'border-amber-500 bg-amber-50/60 shadow-sm ring-1 ring-amber-500/30' : 'border-[#E5E0D8] hover:border-amber-400 bg-white'}">
                        <div class="min-w-0 pr-2">
                            <div class="text-[13px] sm:text-base font-black text-[#1C1917] flex items-center gap-1.5 whitespace-nowrap">
                                <span class="whitespace-nowrap shrink-0">🔋 Outage Protection</span>
                                <span class="text-[9.5px] sm:text-[10px] font-black text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0">⭐ Most Common</span>
                            </div>
                            <div class="text-[11px] sm:text-xs text-stone-500 font-semibold mt-1 truncate">Keep ACs, fridge, lights & Wi-Fi on</div>
                        </div>
                        <span class="w-5 h-5 rounded-full border border-stone-300 shrink-0 ml-2 flex items-center justify-center text-xs checkmark-circle ${wizardState.priority === 'maximum' ? 'bg-amber-500 border-amber-500 text-white font-bold' : 'text-transparent'}">✓</span>
                    </button>

                    <button type="button" role="radio" aria-checked="${wizardState.priority === 'essential'}"
                        onclick="selectWizardCard('priority', 'essential', 4, this)"
                        class="wizard-card w-full p-3 sm:p-4 rounded-2xl border-2 text-left transition-all duration-200 flex items-center justify-between cursor-pointer ${wizardState.priority === 'essential' ? 'border-amber-500 bg-amber-50/60 shadow-sm ring-1 ring-amber-500/30' : 'border-[#E5E0D8] hover:border-amber-400 bg-white'}">
                        <div class="min-w-0 pr-2">
                            <div class="text-[13px] sm:text-base font-black text-[#1C1917] flex items-center gap-1.5 whitespace-nowrap">
                                <span class="whitespace-nowrap shrink-0">🌿 Future-Proof Clean Energy</span>
                            </div>
                            <div class="text-[11px] sm:text-xs text-stone-500 font-semibold mt-1 truncate">Energy independence & 100% clean power</div>
                        </div>
                        <span class="w-5 h-5 rounded-full border border-stone-300 shrink-0 ml-2 flex items-center justify-center text-xs checkmark-circle ${wizardState.priority === 'essential' ? 'bg-amber-500 border-amber-500 text-white font-bold' : 'text-transparent'}">✓</span>
                    </button>
                </div>
            </div>
        `;
    } else if (wizardState.step === 4) {
        let pkgName = 'HS 6 PRO';
        let pkgDesc = '6.2kW Solar | 6kW Inverter | 9.6kWh Storage';
        let pkgMonthly = '₱9,067';
        let pkgSavings = '₱5,500 – ₱8,400';

        if (wizardState.bill === '₱12,000+' || wizardState.bill === '₱8,000–₱12,000') {
            pkgName = 'HS 8 PRO';
            pkgDesc = '8kW Solar | 8kW Inverter | 16kWh Storage';
            pkgMonthly = '₱11,900';
            pkgSavings = '₱10,500 – ₱16,000';
        } else if (wizardState.bill === '₱3,000–₱5,000') {
            pkgName = 'HS 6 LITE';
            pkgDesc = '4.96kW Solar | 6kW Inverter | 4.8kWh Storage';
            pkgMonthly = '₱7,650';
            pkgSavings = '₱4,200 – ₱6,800';
        }

        container.innerHTML = `
            <div class="space-y-6 text-center">
                <div class="space-y-1">
                    <span class="inline-block bg-amber-500/10 text-amber-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                        Recommendation Ready
                    </span>
                    <h3 class="text-2xl sm:text-3xl font-black text-[#1C1917] tracking-tight">Your Ideal Solar Solution</h3>
                    <p class="text-xs sm:text-sm text-stone-500 font-semibold">Matched precisely to your monthly bill and power priorities.</p>
                </div>

                <div class="bg-gradient-to-b from-amber-50/80 to-white border-2 border-amber-400 rounded-3xl p-6 text-left space-y-4 shadow-sm">
                    <div class="flex items-center justify-between border-b border-amber-200/60 pb-3">
                        <div>
                            <span class="text-[10px] font-black text-amber-700 uppercase tracking-wider block">Recommended Package</span>
                            <h4 class="text-xl font-black text-[#1C1917]">${pkgName}</h4>
                        </div>
                        <span class="bg-[#FDC400] text-[#1C1917] text-[11px] font-black px-3 py-1 rounded-full">Top Choice</span>
                    </div>
                    <p class="text-xs font-bold text-stone-600">${pkgDesc}</p>
                    <div class="grid grid-cols-2 gap-3 pt-1">
                        <div class="bg-white/80 border border-stone-200 rounded-xl p-3">
                            <span class="text-[10px] font-bold text-stone-400 uppercase block">Est. Monthly</span>
                            <span class="text-base font-black text-[#1C1917]">${pkgMonthly} /mo</span>
                        </div>
                        <div class="bg-white/80 border border-stone-200 rounded-xl p-3">
                            <span class="text-[10px] font-bold text-stone-400 uppercase block">Est. Bill Savings</span>
                            <span class="text-base font-black text-amber-600">${pkgSavings}</span>
                        </div>
                    </div>
                </div>

                <div class="space-y-2.5">
                    <a href="index.html#solar-systems"
                        class="w-full bg-[#FDC400] hover:bg-[#eab300] active:scale-95 text-[#1C1917] text-xs sm:text-sm font-extrabold py-3.5 rounded-full flex items-center justify-center gap-2 shadow-xs transition cursor-pointer">
                        <span>Explore All Solar Systems</span> &rarr;
                    </a>
                    <button onclick="closeModal('recommendationModal')"
                        class="w-full bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold py-2.5 rounded-full transition cursor-pointer">
                        Close
                    </button>
                </div>
            </div>
        `;
    }
}

// Attach "Get My Recommendation" modal triggers
document.querySelectorAll('[data-action="recommend"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        wizardState.step = 1;
        renderWizard();
        openModal('recommendationModal');
    });
});
