import React, { useState, useEffect, useCallback } from "react";

// ── FIREBASE IMPORTS (works after: npm install firebase) ──────────
import { initializeApp, getApps } from "firebase/app";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, signInWithPopup, GoogleAuthProvider
} from "firebase/auth";
import {
  getFirestore, collection, onSnapshot,
  doc, writeBatch
} from "firebase/firestore";

import { auth } from "./firebase";
import UserAccountHeader from "./components/UserAccountHeader";
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from "react-google-recaptcha-v3";

// ── YOUR FIREBASE CONFIG — paste from Firebase Console ───────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB3I39kwAaFMCNKfEH1TKcrTv9umsjKgAE",
  authDomain: "aquacare-dad.firebaseapp.com",
  projectId: "aquacare-dad",
  storageBucket: "aquacare-dad.firebasestorage.app",
  messagingSenderId: "654114465343",
  appId: "1:654114465343:web:47ccb10817660b6cc1fa8a",
  measurementId: "G-YMLN1TCHVW"
};

// Safe init — app works even if config not filled yet
const FB_READY = FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY";
let fbApp, fbDb;
if (FB_READY) {
  fbApp = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  fbDb = getFirestore(fbApp);
}

// ── FIRESTORE SYNC HOOK ───────────────────────────────────────────
// Real-time Firestore listener + localStorage fallback.
// Writes go to both simultaneously (optimistic local update).
function useFirestoreCollection(colName, localKey, initial, userId) {
  const [data, setLocalData] = useLocalStorage(localKey, initial);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    if (!FB_READY || !userId || !fbDb) return;
    const ref = collection(fbDb, `users/${userId}/${colName}`);
    const unsub = onSnapshot(ref,
      snap => {
        const docs = snap.docs.map(d => ({ ...d.data() }));
        setLocalData(docs.length > 0 ? docs : initial);
        setSyncing(false); setSyncError(null);
      },
      err => { setSyncError(err.message); setSyncing(false); }
    );
    return () => unsub();
  }, [userId, colName]); // eslint-disable-line

  const setData = useCallback(async (newValOrFn) => {
    const newData = typeof newValOrFn === "function" ? newValOrFn(data) : newValOrFn;
    setLocalData(newData);
    if (!FB_READY || !userId || !fbDb) return;
    setSyncing(true);
    try {
      const batch = writeBatch(fbDb);
      const newIds = new Set(newData.map(d => String(d.id)));
      data.forEach(old => {
        if (!newIds.has(String(old.id)))
          batch.delete(doc(fbDb, `users/${userId}/${colName}/${old.id}`));
      });
      newData.forEach(item =>
        batch.set(doc(fbDb, `users/${userId}/${colName}/${item.id}`), item)
      );
      await batch.commit();
    } catch (e) { setSyncError(e.message); }
    setSyncing(false);
  }, [data, userId, colName]); // eslint-disable-line

  return [data, setData, syncing, syncError];
}

// ── LOCAL STORAGE HOOK — data survives page refresh ───────────────
function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
  }, [key, val]);
  return [val, setVal];
}

// ── CSV EXPORT UTILITY ────────────────────────────────────────────
function exportCSV(customers, services, payments, sales) {
  const escape = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["=== CUSTOMERS ==="],
    ["Name", "Phone", "Area", "Address", "Product", "Install Date", "Next Service", "Status", "Payment Status", "Notes"],
    ...customers.map(c => [c.name, c.phone, c.area, c.address || "", c.product, c.installDate, c.nextService, c.status, c.paymentStatus, c.notes || ""]),
    [""],
    ["=== SERVICES ==="],
    ["Customer", "Date", "Type", "Technician", "Cost", "Notes"],
    ...services.map(s => [s.customerName, s.serviceDate, s.serviceType, s.technician, s.cost, s.notes || ""]),
    [""],
    ["=== PAYMENTS ==="],
    ["Customer", "Date", "Amount", "Method", "For", "Status"],
    ...payments.map(p => [p.customerName, p.paymentDate, p.amount, p.paymentMethod, p.paymentFor || "", p.status || "received"]),
    [""],
    ["=== SALES ==="],
    ["Product", "Category", "Qty", "Unit Price", "Total", "Date", "Customer"],
    ...sales.map(s => [s.productName, s.category, s.quantity, s.unitPrice, s.total, s.date, s.customerName || ""]),
  ];
  const csv = rows.map(r => Array.isArray(r) ? r.map(escape).join(",") : r).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `AquaCare_Export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── TRANSLATIONS ─────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    appName: "AquaCare", appSubtitle: "Service Manager",
    dashboard: "Dashboard", customers: "Customers", services: "Services",
    payments: "Payments", reminders: "Reminders", settings: "Settings",
    sales: "Sales",
    totalCustomers: "Total Customers", dueThisWeek: "Due This Week",
    pendingPayments: "Pending Payments", activeServices: "Active Services",
    recentActivity: "Recent Activity", upcomingDues: "Upcoming Dues",
    noActivity: "No recent activity", noDues: "No upcoming dues",
    welcome: "Welcome back", todayStats: "Today's Overview", language: "Language",
    addCustomer: "Add Customer", searchPlaceholder: "Search by name, phone or area...",
    allStatus: "All", active: "Active", due: "Due", overdue: "Overdue",
    noCustomers: "No customers found", name: "Full Name", phone: "Phone Number",
    area: "Area / Location", product: "Product Model", installDate: "Installation Date",
    nextService: "Next Service Date", paymentStatus: "Payment Status",
    paid: "Paid", pending: "Pending", cancel: "Cancel", save: "Save Customer",
    edit: "Edit", delete: "Delete", call: "Call", customerAdded: "Customer added!",
    customerDeleted: "Customer deleted!", confirmDelete: "Delete this customer?",
    required: "This field is required", customerDetails: "Customer Details",
    totalCount: "customers total", filterBy: "Filter",
    address: "Address", notes: "Notes", optional: "optional",
    close: "Close", update: "Update Customer",
    // Services
    logService: "Log Service", serviceHistory: "Service History",
    serviceDate: "Service Date", serviceType: "Service Type",
    serviceNotes: "Service Notes", serviceCost: "Service Cost (₹)",
    technician: "Technician", noServices: "No services logged yet",
    serviceLogged: "Service logged!", selectCustomer: "Select Customer",
    filterCustomer: "Filter by Customer", allCustomers: "All Customers",
    regular: "Regular", repair: "Repair", installation: "Installation", emergency: "Emergency",
    totalServices: "Total Services", thisMonth: "This Month",
    // Payments
    recordPayment: "Record Payment", paymentHistory: "Payment History",
    amount: "Amount (₹)", paymentDate: "Payment Date", paymentMethod: "Payment Method",
    cash: "Cash", upi: "UPI", bankTransfer: "Bank Transfer", cheque: "Cheque",
    paymentFor: "Payment For", noPayments: "No payments recorded yet",
    paymentRecorded: "Payment recorded!", totalCollected: "Total Collected",
    outstanding: "Outstanding", collectedThisMonth: "This Month",
    deletePayment: "Delete payment?", paymentDeleted: "Payment deleted!",
    // Reminders
    addReminder: "Add Reminder", reminderTitle: "Reminder Title",
    reminderDate: "Reminder Date", reminderNote: "Note",
    noReminders: "No reminders set", reminderAdded: "Reminder added!",
    reminderDone: "Marked as done!", reminderDeleted: "Reminder deleted!",
    markDone: "Mark Done", overdueLabel: "Overdue",
    todayLabel: "Today", upcomingLabel: "Upcoming", doneLabel: "Done",
    serviceReminder: "Service Due", paymentReminder: "Payment Due", customReminder: "Custom",
    autoReminders: "Auto Service Reminders", manualReminders: "Manual Reminders",
    // Sales
    addSale: "Add Sale", saleHistory: "Sales History",
    productName: "Product Name", quantity: "Quantity", unitPrice: "Unit Price (₹)",
    totalPrice: "Total (₹)", saleDate: "Sale Date", customerName: "Customer Name",
    noSales: "No sales recorded yet", saleAdded: "Sale added!", saleDeleted: "Sale deleted!",
    deleteSale: "Delete this sale?", totalRevenue: "Total Revenue",
    salesThisMonth: "Sales This Month", totalUnits: "Units Sold",
    category: "Category", aquaguard: "Aquaguard", filter: "Filter/Candle",
    accessory: "Accessory", other: "Other",
    // Settings
    appSettings: "App Settings", theme: "Theme", darkMode: "Dark Mode",
    lightMode: "Light Mode", businessName: "Business Name",
    ownerName: "Owner Name", contactNumber: "Contact Number",
    businessAddress: "Business Address", saveSettings: "Save Settings",
    settingsSaved: "Settings saved!",
    exportData: "Export Data", exportCSV: "Export as CSV",
    aboutApp: "About", version: "Version 3.0",
    currencySymbol: "Currency", inr: "₹ INR",
  },
  bn: {
    appName: "অ্যাকুয়াকেয়ার", appSubtitle: "সার্ভিস ম্যানেজার",
    dashboard: "ড্যাশবোর্ড", customers: "গ্রাহক", services: "সার্ভিস",
    payments: "পেমেন্ট", reminders: "রিমাইন্ডার", settings: "সেটিংস",
    sales: "বিক্রয়",
    totalCustomers: "মোট গ্রাহক", dueThisWeek: "এই সপ্তাহে বাকি",
    pendingPayments: "বকেয়া পেমেন্ট", activeServices: "সক্রিয় সার্ভিস",
    recentActivity: "সাম্প্রতিক কার্যক্রম", upcomingDues: "আসন্ন বাকি",
    noActivity: "কোনো কার্যক্রম নেই", noDues: "কোনো বাকি নেই",
    welcome: "স্বাগতম", todayStats: "আজকের সারসংক্ষেপ", language: "ভাষা",
    addCustomer: "গ্রাহক যোগ করুন", searchPlaceholder: "নাম, ফোন বা এলাকা খুঁজুন...",
    allStatus: "সব", active: "সক্রিয়", due: "বাকি", overdue: "মেয়াদ উত্তীর্ণ",
    noCustomers: "কোনো গ্রাহক পাওয়া যায়নি", name: "পুরো নাম", phone: "ফোন নম্বর",
    area: "এলাকা / অবস্থান", product: "পণ্যের মডেল", installDate: "ইনস্টলেশন তারিখ",
    nextService: "পরবর্তী সার্ভিসের তারিখ", paymentStatus: "পেমেন্টের অবস্থা",
    paid: "পরিশোধিত", pending: "বাকি", cancel: "বাতিল", save: "গ্রাহক সংরক্ষণ",
    edit: "সম্পাদনা", delete: "মুছুন", call: "কল করুন", customerAdded: "গ্রাহক যোগ হয়েছে!",
    customerDeleted: "গ্রাহক মুছে ফেলা হয়েছে!", confirmDelete: "এই গ্রাহক মুছবেন?",
    required: "এই ঘরটি আবশ্যক", customerDetails: "গ্রাহকের বিবরণ",
    totalCount: "জন গ্রাহক মোট", filterBy: "ফিল্টার",
    address: "ঠিকানা", notes: "নোট", optional: "ঐচ্ছিক",
    close: "বন্ধ করুন", update: "গ্রাহক আপডেট করুন",
    logService: "সার্ভিস লগ করুন", serviceHistory: "সার্ভিস ইতিহাস",
    serviceDate: "সার্ভিসের তারিখ", serviceType: "সার্ভিসের ধরন",
    serviceNotes: "সার্ভিস নোট", serviceCost: "সার্ভিস খরচ (₹)",
    technician: "টেকনিশিয়ান", noServices: "কোনো সার্ভিস লগ নেই",
    serviceLogged: "সার্ভিস লগ হয়েছে!", selectCustomer: "গ্রাহক নির্বাচন করুন",
    filterCustomer: "গ্রাহক দিয়ে ফিল্টার", allCustomers: "সব গ্রাহক",
    regular: "নিয়মিত", repair: "মেরামত", installation: "ইনস্টলেশন", emergency: "জরুরি",
    totalServices: "মোট সার্ভিস", thisMonth: "এই মাসে",
    recordPayment: "পেমেন্ট রেকর্ড", paymentHistory: "পেমেন্ট ইতিহাস",
    amount: "পরিমাণ (₹)", paymentDate: "পেমেন্টের তারিখ", paymentMethod: "পেমেন্ট পদ্ধতি",
    cash: "নগদ", upi: "UPI", bankTransfer: "ব্যাংক ট্রান্সফার", cheque: "চেক",
    paymentFor: "পেমেন্টের কারণ", noPayments: "কোনো পেমেন্ট নেই",
    paymentRecorded: "পেমেন্ট রেকর্ড হয়েছে!", totalCollected: "মোট সংগ্রহ",
    outstanding: "বকেয়া", collectedThisMonth: "এই মাসে",
    deletePayment: "পেমেন্ট মুছবেন?", paymentDeleted: "পেমেন্ট মুছে গেছে!",
    addReminder: "রিমাইন্ডার যোগ করুন", reminderTitle: "শিরোনাম",
    reminderDate: "তারিখ", reminderNote: "নোট",
    noReminders: "কোনো রিমাইন্ডার নেই", reminderAdded: "রিমাইন্ডার যোগ হয়েছে!",
    reminderDone: "সম্পন্ন চিহ্নিত!", reminderDeleted: "রিমাইন্ডার মুছে গেছে!",
    markDone: "সম্পন্ন", overdueLabel: "মেয়াদ উত্তীর্ণ",
    todayLabel: "আজ", upcomingLabel: "আসন্ন", doneLabel: "সম্পন্ন",
    serviceReminder: "সার্ভিস বাকি", paymentReminder: "পেমেন্ট বাকি", customReminder: "কাস্টম",
    autoReminders: "স্বয়ংক্রিয় সার্ভিস রিমাইন্ডার", manualReminders: "ম্যানুয়াল রিমাইন্ডার",
    addSale: "বিক্রয় যোগ করুন", saleHistory: "বিক্রয় ইতিহাস",
    productName: "পণ্যের নাম", quantity: "পরিমাণ", unitPrice: "একক মূল্য (₹)",
    totalPrice: "মোট (₹)", saleDate: "বিক্রয়ের তারিখ", customerName: "গ্রাহকের নাম",
    noSales: "কোনো বিক্রয় নেই", saleAdded: "বিক্রয় যোগ হয়েছে!", saleDeleted: "বিক্রয় মুছে গেছে!",
    deleteSale: "এই বিক্রয় মুছবেন?", totalRevenue: "মোট আয়",
    salesThisMonth: "এই মাসের বিক্রয়", totalUnits: "বিক্রিত একক",
    category: "বিভাগ", aquaguard: "অ্যাকুয়াগার্ড", filter: "ফিল্টার/ক্যান্ডেল",
    accessory: "আনুষঙ্গিক", other: "অন্যান্য",
    appSettings: "অ্যাপ সেটিংস", theme: "থিম", darkMode: "ডার্ক মোড",
    lightMode: "লাইট মোড", businessName: "ব্যবসার নাম",
    ownerName: "মালিকের নাম", contactNumber: "যোগাযোগ নম্বর",
    businessAddress: "ব্যবসার ঠিকানা", saveSettings: "সেটিংস সংরক্ষণ",
    settingsSaved: "সেটিংস সংরক্ষিত হয়েছে!",
    exportData: "ডেটা এক্সপোর্ট", exportCSV: "CSV হিসেবে এক্সপোর্ট",
    aboutApp: "পরিচিতি", version: "সংস্করণ ৩.০",
    currencySymbol: "মুদ্রা", inr: "₹ INR",
  },
  hi: {
    appName: "एक्वाकेयर", appSubtitle: "सर्विस मैनेजर",
    dashboard: "डैशबोर्ड", customers: "ग्राहक", services: "सेवाएं",
    payments: "भुगतान", reminders: "रिमाइंडर", settings: "सेटिंग्स",
    sales: "बिक्री",
    totalCustomers: "कुल ग्राहक", dueThisWeek: "इस हफ्ते बाकी",
    pendingPayments: "बकाया भुगतान", activeServices: "सक्रिय सेवाएं",
    recentActivity: "हालिया गतिविधि", upcomingDues: "आगामी बकाया",
    noActivity: "कोई गतिविधि नहीं", noDues: "कोई बकाया नहीं",
    welcome: "वापस स्वागत है", todayStats: "आज का सारांश", language: "भाषा",
    addCustomer: "ग्राहक जोड़ें", searchPlaceholder: "नाम, फोन या क्षेत्र खोजें...",
    allStatus: "सभी", active: "सक्रिय", due: "बकाया", overdue: "अतिदेय",
    noCustomers: "कोई ग्राहक नहीं मिला", name: "पूरा नाम", phone: "फोन नंबर",
    area: "क्षेत्र / स्थान", product: "उत्पाद मॉडल", installDate: "स्थापना तिथि",
    nextService: "अगली सेवा तिथि", paymentStatus: "भुगतान स्थिति",
    paid: "भुगतान किया", pending: "लंबित", cancel: "रद्द करें", save: "ग्राहक सहेजें",
    edit: "संपादित करें", delete: "हटाएं", call: "कॉल करें", customerAdded: "ग्राहक जोड़ा गया!",
    customerDeleted: "ग्राहक हटाया गया!", confirmDelete: "इस ग्राहक को हटाएं?",
    required: "यह फ़ील्ड आवश्यक है", customerDetails: "ग्राहक विवरण",
    totalCount: "ग्राहक कुल", filterBy: "फ़िल्टर",
    address: "पता", notes: "नोट्स", optional: "वैकल्पिक",
    close: "बंद करें", update: "ग्राहक अपडेट करें",
    logService: "सेवा लॉग करें", serviceHistory: "सेवा इतिहास",
    serviceDate: "सेवा तिथि", serviceType: "सेवा प्रकार",
    serviceNotes: "सेवा नोट्स", serviceCost: "सेवा लागत (₹)",
    technician: "तकनीशियन", noServices: "कोई सेवा लॉग नहीं",
    serviceLogged: "सेवा लॉग हुई!", selectCustomer: "ग्राहक चुनें",
    filterCustomer: "ग्राहक से फ़िल्टर", allCustomers: "सभी ग्राहक",
    regular: "नियमित", repair: "मरम्मत", installation: "स्थापना", emergency: "आपातकालीन",
    totalServices: "कुल सेवाएं", thisMonth: "इस महीने",
    recordPayment: "भुगतान दर्ज करें", paymentHistory: "भुगतान इतिहास",
    amount: "राशि (₹)", paymentDate: "भुगतान तिथि", paymentMethod: "भुगतान विधि",
    cash: "नकद", upi: "UPI", bankTransfer: "बैंक ट्रांसफर", cheque: "चेक",
    paymentFor: "भुगतान हेतु", noPayments: "कोई भुगतान नहीं",
    paymentRecorded: "भुगतान दर्ज हुआ!", totalCollected: "कुल संग्रह",
    outstanding: "बकाया", collectedThisMonth: "इस महीने",
    deletePayment: "भुगतान हटाएं?", paymentDeleted: "भुगतान हटाया गया!",
    addReminder: "रिमाइंडर जोड़ें", reminderTitle: "शीर्षक",
    reminderDate: "तिथि", reminderNote: "नोट",
    noReminders: "कोई रिमाइंडर नहीं", reminderAdded: "रिमाइंडर जोड़ा गया!",
    reminderDone: "पूर्ण चिह्नित!", reminderDeleted: "रिमाइंडर हटाया गया!",
    markDone: "पूर्ण", overdueLabel: "अतिदेय",
    todayLabel: "आज", upcomingLabel: "आगामी", doneLabel: "पूर्ण",
    serviceReminder: "सेवा देय", paymentReminder: "भुगतान देय", customReminder: "कस्टम",
    autoReminders: "स्वचालित सेवा रिमाइंडर", manualReminders: "मैनुअल रिमाइंडर",
    addSale: "बिक्री जोड़ें", saleHistory: "बिक्री इतिहास",
    productName: "उत्पाद नाम", quantity: "मात्रा", unitPrice: "इकाई मूल्य (₹)",
    totalPrice: "कुल (₹)", saleDate: "बिक्री तिथि", customerName: "ग्राहक का नाम",
    noSales: "कोई बिक्री नहीं", saleAdded: "बिक्री जोड़ी गई!", saleDeleted: "बिक्री हटाई गई!",
    deleteSale: "यह बिक्री हटाएं?", totalRevenue: "कुल राजस्व",
    salesThisMonth: "इस महीने की बिक्री", totalUnits: "बेची गई इकाइयां",
    category: "श्रेणी", aquaguard: "एक्वागार्ड", filter: "फ़िल्टर/कैंडल",
    accessory: "सहायक उपकरण", other: "अन्य",
    appSettings: "ऐप सेटिंग्स", theme: "थीम", darkMode: "डार्क मोड",
    lightMode: "लाइट मोड", businessName: "व्यवसाय का नाम",
    ownerName: "मालिक का नाम", contactNumber: "संपर्क नंबर",
    businessAddress: "व्यवसाय का पता", saveSettings: "सेटिंग्स सहेजें",
    settingsSaved: "सेटिंग्स सहेजी गईं!",
    exportData: "डेटा निर्यात", exportCSV: "CSV के रूप में निर्यात",
    aboutApp: "परिचय", version: "संस्करण 3.0",
    currencySymbol: "मुद्रा", inr: "₹ INR",
  },
};

// ── ICONS ────────────────────────────────────────────────────────
const Icon = ({ name, size = 20, color = "currentColor" }) => {
  const icons = {
    dashboard: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>),
    customers: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>),
    services: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>),
    payments: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>),
    reminders: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>),
    settings: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>),
    back: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>),
    download: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>),
    info: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>),
    logout: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>),
    sales: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" /></svg>),
    menu: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>),
    close: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>),
    water: (<svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none"><path d="M12 2C6 8 4 12.5 4 15a8 8 0 0 0 16 0c0-2.5-2-7-8-13z" /></svg>),
    trend_up: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>),
    calendar: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>),
    globe: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>),
    search: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>),
    plus: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>),
    phone: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.36 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>),
    location: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>),
    edit: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>),
    trash: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>),
    user: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>),
    droplet: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>),
    check: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>),
    alert: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>),
    filter: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>),
    tag: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>),
    rupee: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8.5 8L14 13H6" /></svg>),
    sun: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>),
    moon: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>),
    store: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>),
    clock: (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>),
  };
  return icons[name] || null;
};

// ── DUMMY DATA ────────────────────────────────────────────────────
const DUMMY_ACTIVITY = [
  { id: 1, name: "Ramesh Kumar", action: "Service completed", time: "2 hrs ago", color: "#22c55e" },
  { id: 2, name: "Priya Sharma", action: "Payment received ₹800", time: "4 hrs ago", color: "#3b82f6" },
  { id: 3, name: "Sunil Das", action: "New customer added", time: "Yesterday", color: "#f59e0b" },
  { id: 4, name: "Meena Devi", action: "Service scheduled", time: "Yesterday", color: "#8b5cf6" },
];

const INITIAL_CUSTOMERS = [
  { id: 1, name: "Ramesh Kumar", phone: "9831012345", area: "Sector 4, Durgapur", product: "Aquaguard Enhance", installDate: "2023-03-15", nextService: "2024-03-15", paymentStatus: "paid", address: "12A, Benachity", notes: "", status: "active" },
  { id: 2, name: "Priya Sharma", phone: "9734056789", area: "New Town, Kolkata", product: "Aquaguard Marvel", installDate: "2023-06-20", nextService: "2024-01-20", paymentStatus: "pending", address: "Flat 3B, Block C", notes: "Prefers morning visits", status: "overdue" },
  { id: 3, name: "Sunil Das", phone: "8001234567", area: "Park Street, Kolkata", product: "Aquaguard Delight", installDate: "2024-01-10", nextService: "2024-06-10", paymentStatus: "paid", address: "45, Park Lane", notes: "", status: "due" },
  { id: 4, name: "Meena Devi", phone: "7890123456", area: "Salt Lake, Kolkata", product: "Aquaguard Superb", installDate: "2023-09-05", nextService: "2024-09-05", paymentStatus: "paid", address: "BE-12, Sector II", notes: "", status: "active" },
  { id: 5, name: "Arjun Singh", phone: "9123456780", area: "Asansol", product: "Aquaguard Enhance", installDate: "2022-12-01", nextService: "2024-05-30", paymentStatus: "pending", address: "Near Station Road", notes: "Call before visit", status: "due" },
  { id: 6, name: "Kavita Rao", phone: "9876500011", area: "Burdwan Town", product: "Aquaguard Marvel", installDate: "2023-11-22", nextService: "2024-11-22", paymentStatus: "paid", address: "27, GT Road", notes: "", status: "active" },
];

const INITIAL_SERVICES = [
  { id: 1, customerId: 1, customerName: "Ramesh Kumar", serviceDate: "2024-05-15", serviceType: "regular", technician: "Raju", cost: 500, notes: "Filter changed" },
  { id: 2, customerId: 2, customerName: "Priya Sharma", serviceDate: "2024-05-10", serviceType: "repair", technician: "Mohan", cost: 1200, notes: "Pump replaced" },
  { id: 3, customerId: 3, customerName: "Sunil Das", serviceDate: "2024-04-28", serviceType: "regular", technician: "Raju", cost: 500, notes: "Routine checkup" },
  { id: 4, customerId: 5, customerName: "Arjun Singh", serviceDate: "2024-04-20", serviceType: "installation", technician: "Mohan", cost: 2000, notes: "New installation" },
];

const INITIAL_PAYMENTS = [
  { id: 1, customerId: 1, customerName: "Ramesh Kumar", amount: 800, date: "2024-05-15", method: "cash", note: "Annual service charge" },
  { id: 2, customerId: 3, customerName: "Sunil Das", amount: 500, date: "2024-05-10", method: "upi", note: "Filter candle" },
  { id: 3, customerId: 4, customerName: "Meena Devi", amount: 1500, date: "2024-04-30", method: "upi", note: "AMC payment" },
  { id: 4, customerId: 6, customerName: "Kavita Rao", amount: 800, date: "2024-04-22", method: "cash", note: "Service charge" },
];

const INITIAL_REMINDERS = [
  { id: 1, customerId: 2, customerName: "Priya Sharma", title: "Service Due", date: "2024-05-30", note: "Overdue — contact immediately", type: "service", done: false },
  { id: 2, customerId: 5, customerName: "Arjun Singh", title: "Payment Pending", date: "2024-06-01", note: "₹1200 outstanding", type: "payment", done: false },
  { id: 3, customerId: 3, customerName: "Sunil Das", title: "Service Due", date: "2024-06-10", note: "Regular checkup", type: "service", done: false },
];

const INITIAL_SALES = [
  { id: 1, productName: "Aquaguard Enhance RO", category: "aquaguard", quantity: 1, unitPrice: 18000, total: 18000, date: "2024-05-20", customerName: "New Customer - Banerjee" },
  { id: 2, productName: "Filter Candle (6-pack)", category: "filter", quantity: 3, unitPrice: 350, total: 1050, date: "2024-05-18", customerName: "Ramesh Kumar" },
  { id: 3, productName: "Aquaguard Marvel UV", category: "aquaguard", quantity: 1, unitPrice: 12500, total: 12500, date: "2024-05-12", customerName: "Walk-in Customer" },
  { id: 4, productName: "UV Lamp Accessory", category: "accessory", quantity: 2, unitPrice: 650, total: 1300, date: "2024-05-08", customerName: "Priya Sharma" },
];

const STATUS_CONFIG = {
  active: { color: "#22c55e", bg: "#22c55e18", label: "active" },
  due: { color: "#f59e0b", bg: "#f59e0b18", label: "due" },
  overdue: { color: "#ef4444", bg: "#ef444418", label: "overdue" },
};

// ── HELPERS ────────────────────────────────────────────────────────
const fmt = (n) => "₹" + Number(n).toLocaleString("en-IN");
const today = () => new Date().toISOString().split("T")[0];
const thisMonth = () => new Date().toISOString().slice(0, 7);

// ── AVATAR ────────────────────────────────────────────────────────
const Avatar = ({ name, size = 40 }) => {
  const colors = ["#38bdf8", "#818cf8", "#f59e0b", "#22c55e", "#f472b6", "#fb923c"];
  const idx = (name || "?").charCodeAt(0) % colors.length;
  const initials = (name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: `linear-gradient(135deg, ${colors[idx]}cc, ${colors[(idx + 2) % colors.length]}cc)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.35, color: "#fff",
      flexShrink: 0, letterSpacing: "0.02em",
    }}>{initials}</div>
  );
};

// ── TOAST ─────────────────────────────────────────────────────────
const Toast = ({ msg, type }) => {
  const isSuccess = type === "success";
  return (
    <div style={{
      position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
      background: "rgba(22, 25, 34, 0.95)",
      backdropFilter: "blur(8px)",
      border: "1px solid var(--border)",
      borderLeft: `4px solid ${isSuccess ? "#22c55e" : "#ef4444"}`,
      color: "#fff", padding: "12px 24px", borderRadius: 16,
      fontSize: 13, fontWeight: 700, zIndex: 9999,
      boxShadow: "0 12px 40px rgba(0, 0, 0, 0.6)",
      display: "flex", alignItems: "center", gap: 10,
      animation: "fadeUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        background: isSuccess ? "#22c55e20" : "#ef444420",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0
      }}>
        <Icon name={isSuccess ? "check" : "alert"} size={12} color={isSuccess ? "#22c55e" : "#ef4444"} />
      </div>
      <span style={{ letterSpacing: "0.01em" }}>{msg}</span>
    </div>
  );
};

// ── CONFIRM DIALOG ─────────────────────────────────────────────────
const ConfirmDialog = ({ message, onConfirm, onCancel, t }) => (
  <div style={{ position: "fixed", inset: 0, background: "#00000085", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
    <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: 24, maxWidth: 300, width: "90%", border: "1px solid var(--border)", textAlign: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#ef444420", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
        <Icon name="trash" size={22} color="#ef4444" />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{message}</div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t.cancel}</button>
        <button onClick={onConfirm} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "#ef4444", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t.delete}</button>
      </div>
    </div>
  </div>
);

// ── STAT MINI ─────────────────────────────────────────────────────
const MiniStat = ({ label, value, color, icon }) => (
  <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon name={icon} size={18} color={color} />
    </div>
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", fontFamily: "'DM Mono', monospace", letterSpacing: "-0.5px" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500, marginTop: 1 }}>{label}</div>
    </div>
  </div>
);

// ── BOTTOM SHEET FORM WRAPPER ─────────────────────────────────────
const BottomSheet = ({ title, subtitle, onClose, children, footer }) => (
  <div style={{ position: "fixed", inset: 0, background: "#00000085", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div style={{ background: "var(--card-bg)", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 520, maxHeight: "92vh", display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderBottom: "none", animation: "slideUp 0.3s cubic-bezier(.4,0,.2,1)" }}>
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Icon name="close" size={16} color="var(--text-muted)" />
        </button>
      </div>
      <div style={{ overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
        {children}
      </div>
      {footer && <div style={{ padding: "14px 20px 24px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>{footer}</div>}
    </div>
  </div>
);

// ── FIELD ────────────────────────────────────────────────────────
const Field = ({ label, children, error, required, optional }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
      {label} {required && <span style={{ color: "#ef4444" }}>*</span>}
      {optional && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> (optional)</span>}
    </label>
    {children}
    {error && <span style={{ fontSize: 11, color: "#ef4444" }}>{error}</span>}
  </div>
);

const inputStyle = (err) => ({
  background: "var(--bg-subtle)", border: `1px solid ${err ? "#ef4444" : "var(--border)"}`,
  borderRadius: 10, padding: "10px 12px", color: "var(--text-primary)",
  fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit",
});

const selectStyle = { background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text-primary)", fontSize: 14, outline: "none", cursor: "pointer", width: "100%", boxSizing: "border-box" };

// ══════════════════════════════════════════════════════════════════
// ── SERVICES PAGE ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
const ServicesPage = ({ t, customers, services, setServices, showToast, isAdmin }) => {
  const [showForm, setShowForm] = useState(false);
  const [filterCust, setFilterCust] = useState("all");
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [selectedService, setSelectedService] = useState(null);

  const blank = { customerId: "", customerName: "", serviceDate: today(), serviceType: "regular", technician: "", cost: "", notes: "" };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});

  const setF = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: "" })); };

  const validate = () => {
    const e = {};
    if (!form.customerId) e.customerId = t.required;
    if (!form.serviceDate) e.serviceDate = t.required;
    if (!form.serviceType) e.serviceType = t.required;
    if (!form.technician.trim()) e.technician = t.required;
    if (!form.cost) e.cost = t.required;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    if (editData) {
      setServices(ss => ss.map(s => s.id === editData.id ? { ...form, id: editData.id, cost: Number(form.cost) } : s));
      showToast("Service updated!", "success");
    } else {
      const newS = { ...form, id: Date.now(), cost: Number(form.cost) };
      setServices(ss => [newS, ...ss]);
      showToast(t.serviceLogged, "success");
    }
    handleCancel();
  };

  const handleEditClick = (record) => {
    setEditData(record);
    setForm(record);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditData(null);
    setForm(blank);
    setErrors({});
  };

  const handleDelete = (id) => {
    setServices(ss => ss.filter(s => s.id !== id));
    setDeleteId(null);
    showToast("Service deleted!", "success");
  };

  const filtered = services.filter(s => {
    const matchCust = filterCust === "all" || String(s.customerId) === filterCust;
    const q = search.toLowerCase();
    const matchSearch = !q || s.customerName.toLowerCase().includes(q) || s.technician.toLowerCase().includes(q) || (s.notes && s.notes.toLowerCase().includes(q));
    return matchCust && matchSearch;
  });
  const totalThisMonth = services.filter(s => s.serviceDate.startsWith(thisMonth())).length;

  const typeColors = { regular: "#38bdf8", repair: "#f59e0b", installation: "#22c55e", emergency: "#ef4444" };

  if (selectedService && isAdmin) {
    return (
      <div style={{ padding: "24px 16px", maxWidth: 600, margin: "0 auto", animation: "fadeUp 0.3s ease" }}>
        <button onClick={() => setSelectedService(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 16px", cursor: "pointer", marginBottom: 20, color: "var(--text-muted)", fontSize: 13, fontWeight: 600 }}>
          <Icon name="back" size={16} color="var(--text-muted)" /> Back
        </button>

        <div className="premium-detail-card">
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <Avatar name={selectedService.customerName} size={64} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>{selectedService.customerName}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Customer Service Record</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Service Type</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: typeColors[selectedService.serviceType] || "#38bdf8", marginTop: 4 }}>
                {t[selectedService.serviceType] || selectedService.serviceType}
              </div>
            </div>

            <div className="grid-2-col">
              <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Service Date</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>{selectedService.serviceDate}</div>
              </div>
              <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Cost</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e", marginTop: 4 }}>{fmt(selectedService.cost)}</div>
              </div>
            </div>

            <div className="grid-2-col">
              <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Technician</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>👤 {selectedService.technician}</div>
              </div>
              <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Record ID</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", marginTop: 6, fontFamily: "monospace" }}>{selectedService.id}</div>
              </div>
            </div>

            {selectedService.notes && (
              <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</div>
                <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 6, lineHeight: "1.5" }}>{selectedService.notes}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>{t.services}</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{services.length} {t.totalServices.toLowerCase()}</div>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditData(null); setForm(blank); setErrors({}); setShowForm(true); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 12, background: "linear-gradient(135deg,#38bdf8,#818cf8)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #38bdf840" }}>
            <Icon name="plus" size={16} color="#fff" />
            {t.logService}
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        <MiniStat label={t.totalServices} value={services.length} color="#38bdf8" icon="services" />
        <MiniStat label={t.thisMonth} value={totalThisMonth} color="#818cf8" icon="calendar" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="search" size={16} color="var(--text-muted)" /></div>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by customer, notes..." style={{ ...inputStyle(false), paddingLeft: 38 }} />
        </div>
        <select value={filterCust} onChange={e => setFilterCust(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 160, flexShrink: 0 }}>
          <option value="all">{t.allCustomers}</option>
          {customers.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--text-muted)" }}>
          <Icon name="services" size={40} color="var(--border)" />
          <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>{t.noServices}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(s => (
            <div
              key={s.id}
              className={isAdmin ? "clickable-card" : ""}
              onClick={() => { if (isAdmin) setSelectedService(s); }}
              style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 16px", animation: "fadeUp 0.25s ease" }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${typeColors[s.serviceType] || "#38bdf8"}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="services" size={18} color={typeColors[s.serviceType] || "#38bdf8"} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{s.customerName}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${typeColors[s.serviceType] || "#38bdf8"}20`, color: typeColors[s.serviceType] || "#38bdf8" }}>{t[s.serviceType] || s.serviceType}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>👤 {s.technician}</span>
                    </div>
                    {s.notes && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.notes}</div>}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#22c55e" }}>{fmt(s.cost)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.serviceDate}</div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={(e) => { e.stopPropagation(); handleEditClick(s); }} style={{ width: 28, height: 28, borderRadius: 8, background: "#38bdf818", border: "1px solid #38bdf830", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Icon name="edit" size={13} color="#38bdf8" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }} style={{ width: 28, height: 28, borderRadius: 8, background: "#ef444418", border: "1px solid #ef444330", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Icon name="trash" size={13} color="#ef4444" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form */}
      {isAdmin && showForm && (
        <BottomSheet title={editData ? "Edit Service" : t.logService} subtitle="AquaCare Service Manager" onClose={handleCancel}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleCancel} style={{ flex: 1, padding: "12px", borderRadius: 12, background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{t.cancel}</button>
              <button onClick={handleSave} style={{ flex: 2, padding: "12px", borderRadius: 12, background: "linear-gradient(135deg,#38bdf8,#818cf8)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{editData ? "Update Service" : t.logService}</button>
            </div>
          }>
          <Field label={t.selectCustomer} error={errors.customerId} required>
            <select value={form.customerId} onChange={e => { const c = customers.find(x => x.id === Number(e.target.value)); setF("customerId", e.target.value); if (c) setF("customerName", c.name); }} style={{ ...selectStyle, borderColor: errors.customerId ? "#ef4444" : "var(--border)" }}>
              <option value="">— {t.selectCustomer} —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.area})</option>)}
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t.serviceDate} error={errors.serviceDate} required>
              <input type="date" value={form.serviceDate} onChange={e => setF("serviceDate", e.target.value)} style={inputStyle(errors.serviceDate)} />
            </Field>
            <Field label={t.serviceType} required>
              <select value={form.serviceType} onChange={e => setF("serviceType", e.target.value)} style={selectStyle}>
                <option value="regular">{t.regular}</option>
                <option value="repair">{t.repair}</option>
                <option value="installation">{t.installation}</option>
                <option value="emergency">{t.emergency}</option>
              </select>
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t.technician} error={errors.technician} required>
              <input type="text" value={form.technician} onChange={e => setF("technician", e.target.value)} placeholder="e.g. Raju" style={inputStyle(errors.technician)} />
            </Field>
            <Field label={t.serviceCost} error={errors.cost} required>
              <input type="number" value={form.cost} onChange={e => setF("cost", e.target.value)} placeholder="500" style={inputStyle(errors.cost)} />
            </Field>
          </div>
          <Field label={t.serviceNotes} optional>
            <textarea rows={2} value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="e.g. Filter replaced, pump cleaned..." style={{ ...inputStyle(false), resize: "none" }} />
          </Field>
        </BottomSheet>
      )}

      {isAdmin && deleteId && <ConfirmDialog message="Delete this service record?" onConfirm={() => handleDelete(deleteId)} onCancel={() => setDeleteId(null)} t={t} />}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// ── PAYMENTS PAGE ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
const PaymentsPage = ({ t, customers, payments, setPayments, showToast, isAdmin }) => {
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [search, setSearch] = useState("");

  const blank = { customerId: "", customerName: "", amount: "", date: today(), method: "cash", note: "" };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const setF = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: "" })); };

  const validate = () => {
    const e = {};
    if (!form.customerId) e.customerId = t.required;
    if (!form.amount || Number(form.amount) <= 0) e.amount = t.required;
    if (!form.date) e.date = t.required;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    if (editData) {
      setPayments(ps => ps.map(p => p.id === editData.id ? { ...form, id: editData.id, amount: Number(form.amount) } : p));
      showToast("Payment updated!", "success");
    } else {
      setPayments(ps => [{ ...form, id: Date.now(), amount: Number(form.amount) }, ...ps]);
      showToast(t.paymentRecorded, "success");
    }
    handleCancel();
  };

  const handleEditClick = (record) => {
    setEditData(record);
    setForm(record);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditData(null);
    setForm(blank);
    setErrors({});
  };

  const handleDelete = (id) => {
    setPayments(ps => ps.filter(p => p.id !== id));
    setDeleteId(null);
    showToast(t.paymentDeleted, "success");
  };

  const totalCollected = payments.reduce((s, p) => s + p.amount, 0);
  const collectedThisMonth = payments.filter(p => p.date.startsWith(thisMonth())).reduce((s, p) => s + p.amount, 0);
  const pendingCount = customers.filter(c => c.paymentStatus === "pending").length;

  const filtered = payments.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.customerName.toLowerCase().includes(q) || (p.note && p.note.toLowerCase().includes(q)) || p.method.toLowerCase().includes(q);
    return matchSearch;
  });

  const methodColors = { cash: "#22c55e", upi: "#818cf8", bankTransfer: "#38bdf8", cheque: "#f59e0b" };
  const methodIcons = { cash: "rupee", upi: "phone", bankTransfer: "store", cheque: "edit" };

  if (selectedPayment && isAdmin) {
    const mc = methodColors[selectedPayment.method] || "#38bdf8";
    const mi = methodIcons[selectedPayment.method] || "rupee";
    return (
      <div style={{ padding: "24px 16px", maxWidth: 600, margin: "0 auto", animation: "fadeUp 0.3s ease" }}>
        <button onClick={() => setSelectedPayment(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 16px", cursor: "pointer", marginBottom: 20, color: "var(--text-muted)", fontSize: 13, fontWeight: 600 }}>
          <Icon name="back" size={16} color="var(--text-muted)" /> Back
        </button>

        <div className="premium-detail-card">
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <Avatar name={selectedPayment.customerName} size={64} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>{selectedPayment.customerName}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Customer Payment Record</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Amount</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e", marginTop: 4 }}>{fmt(selectedPayment.amount)}</div>
            </div>

            <div className="grid-2-col">
              <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Payment Method</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, color: mc, marginTop: 4 }}>
                  <Icon name={mi} size={16} color={mc} /> {t[selectedPayment.method] || selectedPayment.method}
                </div>
              </div>
              <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Payment Date</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>{selectedPayment.date}</div>
              </div>
            </div>

            <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Record Details</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Record ID:</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", fontFamily: "monospace" }}>{selectedPayment.id}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Customer ID:</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", fontFamily: "monospace" }}>{selectedPayment.customerId}</span>
                </div>
              </div>
            </div>

            {selectedPayment.note && (
              <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Note / Description</div>
                <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 6, lineHeight: "1.5" }}>{selectedPayment.note}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>{t.payments}</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{payments.length} records</div>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditData(null); setForm(blank); setErrors({}); setShowForm(true); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 12, background: "linear-gradient(135deg,#22c55e,#16a34a)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #22c55e40" }}>
            <Icon name="plus" size={16} color="#fff" />
            {t.recordPayment}
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
        <MiniStat label={t.totalCollected} value={fmt(totalCollected)} color="#22c55e" icon="rupee" />
        <MiniStat label={t.collectedThisMonth} value={fmt(collectedThisMonth)} color="#38bdf8" icon="trend_up" />
        <MiniStat label={t.outstanding} value={pendingCount} color="#ef4444" icon="alert" />
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="search" size={16} color="var(--text-muted)" /></div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by customer, note, method..." style={{ ...inputStyle(false), paddingLeft: 38 }} />
      </div>

      {/* Payment list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--text-muted)" }}>
          <Icon name="payments" size={40} color="var(--border)" />
          <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>{t.noPayments}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(p => {
            const mc = methodColors[p.method] || "#38bdf8";
            const mi = methodIcons[p.method] || "rupee";
            return (
              <div key={p.id}
                className={isAdmin ? "clickable-card" : ""}
                onClick={() => { if (isAdmin) setSelectedPayment(p); }}
                style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, animation: "fadeUp 0.25s ease" }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `${mc}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name={mi} size={18} color={mc} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{p.customerName}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${mc}20`, color: mc }}>{t[p.method] || p.method}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.date}</span>
                  </div>
                  {p.note && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.note}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e" }}>{fmt(p.amount)}</div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={(e) => { e.stopPropagation(); handleEditClick(p); }} style={{ width: 28, height: 28, borderRadius: 8, background: "#38bdf818", border: "1px solid #38bdf830", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Icon name="edit" size={13} color="#38bdf8" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteId(p.id); }} style={{ width: 28, height: 28, borderRadius: 8, background: "#ef444418", border: "1px solid #ef444330", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Icon name="trash" size={13} color="#ef4444" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form */}
      {isAdmin && showForm && (
        <BottomSheet title={editData ? "Edit Payment" : t.recordPayment} subtitle="AquaCare" onClose={handleCancel}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleCancel} style={{ flex: 1, padding: "12px", borderRadius: 12, background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{t.cancel}</button>
              <button onClick={handleSave} style={{ flex: 2, padding: "12px", borderRadius: 12, background: "linear-gradient(135deg,#22c55e,#16a34a)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{editData ? "Update Payment" : t.recordPayment}</button>
            </div>
          }>
          <Field label={t.selectCustomer} error={errors.customerId} required>
            <select value={form.customerId} onChange={e => { const c = customers.find(x => x.id === Number(e.target.value)); setF("customerId", e.target.value); if (c) setF("customerName", c.name); }} style={{ ...selectStyle, borderColor: errors.customerId ? "#ef4444" : "var(--border)" }}>
              <option value="">— {t.selectCustomer} —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.area})</option>)}
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t.amount} error={errors.amount} required>
              <input type="number" value={form.amount} onChange={e => setF("amount", e.target.value)} placeholder="800" style={inputStyle(errors.amount)} />
            </Field>
            <Field label={t.paymentDate} error={errors.date} required>
              <input type="date" value={form.date} onChange={e => setF("date", e.target.value)} style={inputStyle(errors.date)} />
            </Field>
          </div>
          <Field label={t.paymentMethod} required>
            <select value={form.method} onChange={e => setF("method", e.target.value)} style={selectStyle}>
              <option value="cash">{t.cash}</option>
              <option value="upi">{t.upi}</option>
              <option value="bankTransfer">{t.bankTransfer}</option>
              <option value="cheque">{t.cheque}</option>
            </select>
          </Field>
          <Field label={t.paymentFor} optional>
            <input type="text" value={form.note} onChange={e => setF("note", e.target.value)} placeholder="e.g. Annual AMC, filter candle..." style={inputStyle(false)} />
          </Field>
        </BottomSheet>
      )}

      {isAdmin && deleteId && <ConfirmDialog message={t.deletePayment} onConfirm={() => handleDelete(deleteId)} onCancel={() => setDeleteId(null)} t={t} />}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// ── REMINDERS PAGE ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
const RemindersPage = ({ t, customers, reminders, setReminders, showToast, isAdmin }) => {
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [activeTab, setActiveTab] = useState("active");

  const blank = { title: "", date: today(), note: "", type: "custom", customerId: "", customerName: "", done: false };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const setF = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: "" })); };

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = t.required;
    if (!form.date) e.date = t.required;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    setReminders(rs => [{ ...form, id: Date.now() }, ...rs]);
    showToast(t.reminderAdded, "success");
    setShowForm(false); setForm(blank);
  };

  const handleDone = (id) => {
    setReminders(rs => rs.map(r => r.id === id ? { ...r, done: true } : r));
    showToast(t.reminderDone, "success");
  };

  const handleDelete = (id) => {
    setReminders(rs => rs.filter(r => r.id !== id));
    setDeleteId(null);
    showToast(t.reminderDeleted, "success");
  };

  // Auto-generate service reminders from customers
  const autoReminders = customers
    .filter(c => c.status === "due" || c.status === "overdue")
    .map(c => ({ id: `auto_${c.id}`, title: t.serviceReminder, date: c.nextService, note: `${c.product} — ${c.area}`, type: "service", customerName: c.name, done: false, auto: true }));

  const todayStr = today();
  const getStatus = (r) => {
    if (r.done) return "done";
    if (r.date < todayStr) return "overdue";
    if (r.date === todayStr) return "today";
    return "upcoming";
  };

  const activeReminders = [...reminders.filter(r => !r.done), ...autoReminders];
  const doneReminders = reminders.filter(r => r.done);

  const tabs = [
    { key: "active", label: `${t.upcomingLabel} (${activeReminders.length})` },
    { key: "done", label: `${t.doneLabel} (${doneReminders.length})` },
  ];

  const displayed = activeTab === "active" ? activeReminders : doneReminders;

  const statusColors = { overdue: "#ef4444", today: "#f59e0b", upcoming: "#38bdf8", done: "#22c55e" };
  const statusLabels = { overdue: t.overdueLabel, today: t.todayLabel, upcoming: t.upcomingLabel, done: t.doneLabel };

  return (
    <div style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>{t.reminders}</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{activeReminders.length} active</div>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 12, background: "linear-gradient(135deg,#f59e0b,#f97316)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #f59e0b40" }}>
            <Icon name="plus" size={16} color="#fff" />
            {t.addReminder}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: "7px 16px", borderRadius: 20, border: "1px solid",
            borderColor: activeTab === tab.key ? "#f59e0b" : "var(--border)",
            background: activeTab === tab.key ? "#f59e0b18" : "var(--card-bg)",
            color: activeTab === tab.key ? "#f59e0b" : "var(--text-muted)",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>{tab.label}</button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--text-muted)" }}>
          <Icon name="reminders" size={40} color="var(--border)" />
          <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>{t.noReminders}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {displayed.map(r => {
            const st = getStatus(r);
            const sc = statusColors[st];
            return (
              <div key={r.id} style={{ background: "var(--card-bg)", border: `1px solid ${r.done ? "var(--border)" : sc + "40"}`, borderRadius: 16, padding: "14px 16px", opacity: r.done ? 0.6 : 1, animation: "fadeUp 0.25s ease" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{r.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${sc}20`, color: sc }}>{statusLabels[st]}</span>
                      {r.auto && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: "#38bdf820", color: "#38bdf8" }}>AUTO</span>}
                    </div>
                    {r.customerName && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>👤 {r.customerName}</div>}
                    {r.note && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note}</div>}
                    <div style={{ fontSize: 11, color: sc, fontWeight: 700, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon name="calendar" size={11} color={sc} /> {r.date}
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                      {!r.done && !r.auto && (
                        <button onClick={() => handleDone(r.id)} style={{ width: 30, height: 30, borderRadius: 8, background: "#22c55e18", border: "1px solid #22c55e30", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <Icon name="check" size={13} color="#22c55e" />
                        </button>
                      )}
                      {!r.auto && (
                        <button onClick={() => setDeleteId(r.id)} style={{ width: 30, height: 30, borderRadius: 8, background: "#ef444418", border: "1px solid #ef444330", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <Icon name="trash" size={13} color="#ef4444" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAdmin && showForm && (
        <BottomSheet title={t.addReminder} subtitle="AquaCare" onClose={() => setShowForm(false)}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "12px", borderRadius: 12, background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{t.cancel}</button>
              <button onClick={handleSave} style={{ flex: 2, padding: "12px", borderRadius: 12, background: "linear-gradient(135deg,#f59e0b,#f97316)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{t.addReminder}</button>
            </div>
          }>
          <Field label={t.reminderTitle} error={errors.title} required>
            <input type="text" value={form.title} onChange={e => setF("title", e.target.value)} placeholder="e.g. Service Due for Ramesh" style={inputStyle(errors.title)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t.reminderDate} error={errors.date} required>
              <input type="date" value={form.date} onChange={e => setF("date", e.target.value)} style={inputStyle(errors.date)} />
            </Field>
            <Field label="Type" required>
              <select value={form.type} onChange={e => setF("type", e.target.value)} style={selectStyle}>
                <option value="service">{t.serviceReminder}</option>
                <option value="payment">{t.paymentReminder}</option>
                <option value="custom">{t.customReminder}</option>
              </select>
            </Field>
          </div>
          <Field label={t.selectCustomer} optional>
            <select value={form.customerId} onChange={e => { const c = customers.find(x => x.id === Number(e.target.value)); setF("customerId", e.target.value); if (c) setF("customerName", c.name); else setF("customerName", ""); }} style={selectStyle}>
              <option value="">— {t.selectCustomer} (optional) —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t.reminderNote} optional>
            <textarea rows={2} value={form.note} onChange={e => setF("note", e.target.value)} placeholder="Additional notes..." style={{ ...inputStyle(false), resize: "none" }} />
          </Field>
        </BottomSheet>
      )}

      {isAdmin && deleteId && <ConfirmDialog message={t.reminderDeleted} onConfirm={() => handleDelete(deleteId)} onCancel={() => setDeleteId(null)} t={t} />}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// ── SALES PAGE ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
const SalesPage = ({ t, customers, sales, setSales, showToast, isAdmin }) => {
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const [editData, setEditData] = useState(null);
  const [selectedSale, setSelectedSale] = useState(null);
  const [search, setSearch] = useState("");

  const blank = { productName: "", category: "aquaguard", quantity: 1, unitPrice: "", total: 0, date: today(), customerName: "" };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});

  const setF = (k, v) => {
    setForm(f => {
      const updated = { ...f, [k]: v };
      if (k === "quantity" || k === "unitPrice") {
        updated.total = (Number(k === "quantity" ? v : f.quantity) || 0) * (Number(k === "unitPrice" ? v : f.unitPrice) || 0);
      }
      return updated;
    });
    setErrors(e => ({ ...e, [k]: "" }));
  };

  const validate = () => {
    const e = {};
    if (!form.productName.trim()) e.productName = t.required;
    if (!form.quantity || Number(form.quantity) < 1) e.quantity = t.required;
    if (!form.unitPrice || Number(form.unitPrice) <= 0) e.unitPrice = t.required;
    if (!form.date) e.date = t.required;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const quantity = Number(form.quantity);
    const unitPrice = Number(form.unitPrice);
    const total = quantity * unitPrice;
    if (editData) {
      setSales(ss => ss.map(s => s.id === editData.id ? { ...form, id: editData.id, quantity, unitPrice, total } : s));
      showToast("Sale updated!", "success");
    } else {
      setSales(ss => [{ ...form, id: Date.now(), quantity, unitPrice, total }, ...ss]);
      showToast(t.saleAdded, "success");
    }
    handleCancel();
  };

  const handleEditClick = (record) => {
    setEditData(record);
    setForm(record);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditData(null);
    setForm(blank);
    setErrors({});
  };

  const handleDelete = (id) => {
    setSales(ss => ss.filter(s => s.id !== id));
    setDeleteId(null);
    showToast(t.saleDeleted, "success");
  };

  const totalRevenue = sales.reduce((s, sale) => s + sale.total, 0);
  const salesThisMonth = sales.filter(s => s.date.startsWith(thisMonth()));
  const salesThisMonthRevenue = salesThisMonth.reduce((s, sale) => s + sale.total, 0);
  const totalUnits = sales.reduce((s, sale) => s + sale.quantity, 0);

  const catColors = { aquaguard: "#38bdf8", filter: "#22c55e", accessory: "#818cf8", other: "#f59e0b" };

  const filtered = (filterCat === "all" ? sales : sales.filter(s => s.category === filterCat)).filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.productName.toLowerCase().includes(q) || (s.customerName && s.customerName.toLowerCase().includes(q));
    return matchSearch;
  });
  const CATS = [
    { key: "all", label: t.allStatus },
    { key: "aquaguard", label: t.aquaguard },
    { key: "filter", label: t.filter },
    { key: "accessory", label: t.accessory },
    { key: "other", label: t.other },
  ];

  // Revenue by category donut data
  const catRevenue = ["aquaguard", "filter", "accessory", "other"].map(cat => ({
    cat, rev: sales.filter(s => s.category === cat).reduce((s, x) => s + x.total, 0), color: catColors[cat]
  })).filter(x => x.rev > 0);

  if (selectedSale && isAdmin) {
    const cc = catColors[selectedSale.category] || "#818cf8";
    const catEmoji = selectedSale.category === "aquaguard" ? "💧" : selectedSale.category === "filter" ? "🔧" : selectedSale.category === "accessory" ? "🔌" : "📦";
    return (
      <div style={{ padding: "24px 16px", maxWidth: 600, margin: "0 auto", animation: "fadeUp 0.3s ease" }}>
        <button onClick={() => setSelectedSale(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 16px", cursor: "pointer", marginBottom: 20, color: "var(--text-muted)", fontSize: 13, fontWeight: 600 }}>
          <Icon name="back" size={16} color="var(--text-muted)" /> Back
        </button>

        <div className="premium-detail-card">
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: `${cc}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
              {catEmoji}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>{selectedSale.productName}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Product Sale Record</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Sale Revenue</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#818cf8", marginTop: 4 }}>{fmt(selectedSale.total)}</div>
            </div>

            <div className="grid-2-col">
              <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: cc, marginTop: 4 }}>
                  {t[selectedSale.category] || selectedSale.category}
                </div>
              </div>
              <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sale Date</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>{selectedSale.date}</div>
              </div>
            </div>

            <div className="grid-2-col">
              <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Quantity</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>{selectedSale.quantity} units</div>
              </div>
              <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Unit Price</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>{fmt(selectedSale.unitPrice)}</div>
              </div>
            </div>

            <div style={{ background: "var(--bg-subtle)", borderRadius: 14, padding: 16, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Record Details</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Record ID:</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", fontFamily: "monospace" }}>{selectedSale.id}</span>
                </div>
                {selectedSale.customerName && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Customer Name:</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{selectedSale.customerName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>{t.sales}</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{sales.length} records</div>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditData(null); setForm(blank); setErrors({}); setShowForm(true); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 12, background: "linear-gradient(135deg,#818cf8,#a78bfa)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #818cf840" }}>
            <Icon name="plus" size={16} color="#fff" />
            {t.addSale}
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
        <MiniStat label={t.totalRevenue} value={fmt(totalRevenue)} color="#818cf8" icon="rupee" />
        <MiniStat label={t.salesThisMonth} value={fmt(salesThisMonthRevenue)} color="#38bdf8" icon="trend_up" />
        <MiniStat label={t.totalUnits} value={totalUnits} color="#22c55e" icon="tag" />
      </div>

      {/* Category breakdown */}
      {catRevenue.length > 0 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Revenue by Category</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {catRevenue.map(({ cat, rev, color }) => {
              const pct = totalRevenue > 0 ? (rev / totalRevenue * 100).toFixed(0) : 0;
              return (
                <div key={cat}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{t[cat] || cat}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{fmt(rev)} ({pct}%)</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "var(--bg-subtle)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="search" size={16} color="var(--text-muted)" /></div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by product, customer..." style={{ ...inputStyle(false), paddingLeft: 38 }} />
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 7, marginBottom: 16, overflowX: "auto", paddingBottom: 2 }}>
        {CATS.map(c => (
          <button key={c.key} onClick={() => setFilterCat(c.key)} style={{
            padding: "6px 14px", borderRadius: 20, border: "1px solid",
            borderColor: filterCat === c.key ? "var(--accent2)" : "var(--border)",
            background: filterCat === c.key ? "#818cf818" : "var(--card-bg)",
            color: filterCat === c.key ? "var(--accent2)" : "var(--text-muted)",
            fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
          }}>{c.label}</button>
        ))}
      </div>

      {/* Sales list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--text-muted)" }}>
          <Icon name="sales" size={40} color="var(--border)" />
          <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>{t.noSales}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(s => {
            const cc = catColors[s.category] || "#818cf8";
            return (
              <div key={s.id}
                className={isAdmin ? "clickable-card" : ""}
                onClick={() => { if (isAdmin) setSelectedSale(s); }}
                style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 16px", animation: "fadeUp 0.25s ease" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: `${cc}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>
                      {s.category === "aquaguard" ? "💧" : s.category === "filter" ? "🔧" : s.category === "accessory" ? "🔌" : "📦"}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.productName}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${cc}20`, color: cc }}>{t[s.category] || s.category}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>×{s.quantity} @ {fmt(s.unitPrice)}</span>
                      </div>
                      {s.customerName && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>👤 {s.customerName}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#818cf8" }}>{fmt(s.total)}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.date}</div>
                    {isAdmin && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={(e) => { e.stopPropagation(); handleEditClick(s); }} style={{ width: 28, height: 28, borderRadius: 8, background: "#38bdf818", border: "1px solid #38bdf830", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <Icon name="edit" size={13} color="#38bdf8" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }} style={{ width: 28, height: 28, borderRadius: 8, background: "#ef444418", border: "1px solid #ef444330", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <Icon name="trash" size={13} color="#ef4444" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form */}
      {isAdmin && showForm && (
        <BottomSheet title={editData ? "Edit Sale" : t.addSale} subtitle="AquaCare Sales" onClose={handleCancel}
          footer={
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleCancel} style={{ flex: 1, padding: "12px", borderRadius: 12, background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{t.cancel}</button>
              <button onClick={handleSave} style={{ flex: 2, padding: "12px", borderRadius: 12, background: "linear-gradient(135deg,#818cf8,#a78bfa)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{editData ? "Update Sale" : t.addSale}</button>
            </div>
          }>
          <Field label={t.productName} error={errors.productName} required>
            <input type="text" value={form.productName} onChange={e => setF("productName", e.target.value)} placeholder="e.g. Aquaguard Enhance RO" style={inputStyle(errors.productName)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t.category} required>
              <select value={form.category} onChange={e => setF("category", e.target.value)} style={selectStyle}>
                <option value="aquaguard">{t.aquaguard}</option>
                <option value="filter">{t.filter}</option>
                <option value="accessory">{t.accessory}</option>
                <option value="other">{t.other}</option>
              </select>
            </Field>
            <Field label={t.saleDate} error={errors.date} required>
              <input type="date" value={form.date} onChange={e => setF("date", e.target.value)} style={inputStyle(errors.date)} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t.quantity} error={errors.quantity} required>
              <input type="number" min="1" value={form.quantity} onChange={e => setF("quantity", e.target.value)} placeholder="1" style={inputStyle(errors.quantity)} />
            </Field>
            <Field label={t.unitPrice} error={errors.unitPrice} required>
              <input type="number" value={form.unitPrice} onChange={e => setF("unitPrice", e.target.value)} placeholder="18000" style={inputStyle(errors.unitPrice)} />
            </Field>
          </div>
          {form.total > 0 && (
            <div style={{ background: "#818cf820", border: "1px solid #818cf840", borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>{t.totalPrice}</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#818cf8" }}>{fmt(form.total)}</span>
            </div>
          )}
          <Field label={t.customerName} optional>
            <input type="text" value={form.customerName} onChange={e => setF("customerName", e.target.value)} placeholder="Customer name or 'Walk-in'" style={inputStyle(false)} />
          </Field>
        </BottomSheet>
      )}

      {isAdmin && deleteId && <ConfirmDialog message={t.deleteSale} onConfirm={() => handleDelete(deleteId)} onCancel={() => setDeleteId(null)} t={t} />}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// ── SETTINGS PAGE ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
const SettingsPage = ({ t, lang, setLang, showToast, customers, services, payments, sales, user, onLogout, isAdmin }) => {
  const [biz, setBiz] = useState({ businessName: "AquaCare Services", ownerName: "Owner", contactNumber: "", businessAddress: "" });
  const setB = (k, v) => setBiz(b => ({ ...b, [k]: v }));

  const LANGS = [
    { code: "en", label: "English", flag: "🇬🇧" },
    { code: "bn", label: "বাংলা", flag: "🇧🇩" },
    { code: "hi", label: "हिंदी", flag: "🇮🇳" },
  ];

  const handleSave = () => showToast(t.settingsSaved, "success");

  const SectionHeader = ({ title, icon }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, marginTop: 4 }}>
      <Icon name={icon} size={16} color="var(--accent)" />
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{title}</span>
    </div>
  );

  return (
    <div style={{ padding: "20px 16px", maxWidth: 500, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 24px 0" }}>{t.settings}</h1>

      {/* Account & Sync — only shown when Firebase is active */}
      {FB_READY && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
          <SectionHeader title="Account & Sync" icon="user" />
          {/* User info */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, padding: "10px 14px", background: "var(--bg-subtle)", borderRadius: 12, border: "1px solid var(--border)" }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#38bdf8,#818cf8)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="user" size={18} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email || "Not signed in"}</div>
              <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 600, marginTop: 2 }}>✓ Firebase connected · Data synced to cloud</div>
            </div>
          </div>
          {/* Logout */}
          <button
            onClick={async () => { const success = await onLogout(); if (success) showToast("Signed out successfully", "success"); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "11px", borderRadius: 12, background: "#ef444418", border: "1px solid #ef444430", color: "#ef4444", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            <Icon name="logout" size={16} color="#ef4444" />
            Sign Out
          </button>
        </div>
      )}

      {/* Language */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
        <SectionHeader title={t.language} icon="globe" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {LANGS.map(l => (
            <button key={l.code} onClick={() => setLang(l.code)} style={{
              padding: "8px 16px", borderRadius: 20, border: "2px solid",
              borderColor: lang === l.code ? "var(--accent)" : "var(--border)",
              background: lang === l.code ? "#38bdf818" : "var(--bg-subtle)",
              color: lang === l.code ? "var(--accent)" : "var(--text-muted)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}>{l.flag} {l.label}</button>
          ))}
        </div>
      </div>

      {/* Business Info */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
        <SectionHeader title={t.businessName} icon="store" />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { key: "businessName", label: t.businessName, placeholder: "AquaCare Services" },
            { key: "ownerName", label: t.ownerName, placeholder: "Your name" },
            { key: "contactNumber", label: t.contactNumber, placeholder: "9800000000", type: "tel" },
            { key: "businessAddress", label: t.businessAddress, placeholder: "City, State" },
          ].map(({ key, label, placeholder, type }) => (
            <Field key={key} label={label}>
              <input type={type || "text"} value={biz[key]} onChange={e => setB(key, e.target.value)} placeholder={placeholder} style={inputStyle(false)} disabled={!isAdmin} />
            </Field>
          ))}
        </div>
      </div>

      {/* Export */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
        <SectionHeader title={t.exportData} icon="download" />
        <button onClick={() => { exportCSV(customers, services, payments, sales); showToast("CSV exported! Check your downloads.", "success"); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" }}>
          <Icon name="download" size={16} color="var(--accent)" />
          {t.exportCSV}
        </button>
      </div>

      {/* About */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 18px", marginBottom: 20 }}>
        <SectionHeader title={t.aboutApp} icon="info" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{t.version}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>3.0</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{t.currencySymbol}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{t.inr}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Built for</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>Aquaguard Dealers 💧</span>
          </div>
        </div>
      </div>

      {isAdmin && (
        <button onClick={handleSave} style={{ width: "100%", padding: "14px", borderRadius: 14, background: "linear-gradient(135deg,#38bdf8,#818cf8)", border: "none", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 20px #38bdf840" }}>
          {t.saveSettings}
        </button>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// ── CUSTOMER FORM FIELD ──────────────────────────────────────────
const FField = ({ label, fkey, type = "text", required = true, placeholder = "", form, set, errors, t }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
      {label} {required && <span style={{ color: "#ef4444" }}>*</span>}
      {!required && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> ({t.optional})</span>}
    </label>
    {type === "textarea" ? (
      <textarea rows={2} value={form[fkey]} onChange={e => set(fkey, e.target.value)} placeholder={placeholder} style={{ background: "var(--bg-subtle)", border: `1px solid ${errors[fkey] ? "#ef4444" : "var(--border)"}`, borderRadius: 10, padding: "10px 12px", color: "var(--text-primary)", fontSize: 14, resize: "none", outline: "none", fontFamily: "inherit" }} />
    ) : type === "select" ? (
      <select value={form[fkey]} onChange={e => set(fkey, e.target.value)} style={{ background: "var(--bg-subtle)", border: `1px solid ${errors[fkey] ? "#ef4444" : "var(--border)"}`, borderRadius: 10, padding: "10px 12px", color: "var(--text-primary)", fontSize: 14, outline: "none", cursor: "pointer" }}>
        <option value="paid">{t.paid}</option>
        <option value="pending">{t.pending}</option>
      </select>
    ) : (
      <input type={type} value={form[fkey]} onChange={e => set(fkey, e.target.value)} placeholder={placeholder} style={{ background: "var(--bg-subtle)", border: `1px solid ${errors[fkey] ? "#ef4444" : "var(--border)"}`, borderRadius: 10, padding: "10px 12px", color: "var(--text-primary)", fontSize: 14, outline: "none" }} />
    )}
    {errors[fkey] && <span style={{ fontSize: 11, color: "#ef4444" }}>{errors[fkey]}</span>}
  </div>
);

// ── CUSTOMER FORM (from Part 2 — preserved) ─────────────────────
// ══════════════════════════════════════════════════════════════════
const CustomerForm = ({ t, onSave, onClose, editData }) => {
  const blank = { name: "", phone: "", area: "", product: "", installDate: "", nextService: "", paymentStatus: "paid", address: "", notes: "", status: "active" };
  const [form, setForm] = useState(editData || blank);
  const [errors, setErrors] = useState({});
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: "" })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = t.required;
    if (!form.phone.trim()) e.phone = t.required;
    if (!form.area.trim()) e.area = t.required;
    if (!form.product.trim()) e.product = t.required;
    if (!form.installDate) e.installDate = t.required;
    if (!form.nextService) e.nextService = t.required;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => { if (validate()) onSave(form); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000085", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--card-bg)", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 520, maxHeight: "92vh", display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderBottom: "none", animation: "slideUp 0.3s cubic-bezier(.4,0,.2,1)" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>{editData ? t.update : t.addCustomer}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>AquaCare Service Manager</div>
          </div>
          <button onClick={onClose} style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Icon name="close" size={16} color="var(--text-muted)" />
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <FField label={t.name} fkey="name" placeholder="e.g. Ramesh Kumar" form={form} set={set} errors={errors} t={t} />
          <FField label={t.phone} fkey="phone" type="tel" placeholder="e.g. 9831012345" form={form} set={set} errors={errors} t={t} />
          <FField label={t.area} fkey="area" placeholder="e.g. Sector 4, Durgapur" form={form} set={set} errors={errors} t={t} />
          <FField label={t.address} fkey="address" required={false} placeholder="e.g. 12A, Benachity Road" form={form} set={set} errors={errors} t={t} />
          <FField label={t.product} fkey="product" placeholder="e.g. Aquaguard Enhance" form={form} set={set} errors={errors} t={t} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FField label={t.installDate} fkey="installDate" type="date" form={form} set={set} errors={errors} t={t} />
            <FField label={t.nextService} fkey="nextService" type="date" form={form} set={set} errors={errors} t={t} />
          </div>
          <FField label={t.paymentStatus} fkey="paymentStatus" type="select" form={form} set={set} errors={errors} t={t} />
          <FField label={t.notes} fkey="notes" type="textarea" required={false} placeholder="Any special instructions..." form={form} set={set} errors={errors} t={t} />
        </div>
        <div style={{ padding: "14px 20px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 12, background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{t.cancel}</button>
          <button onClick={handleSave} style={{ flex: 2, padding: "12px", borderRadius: 12, background: "linear-gradient(135deg, #38bdf8, #818cf8)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #38bdf840" }}>{editData ? t.update : t.save}</button>
        </div>
      </div>
    </div>
  );
};

// ── CELL INPUT COMPONENT (For spreadsheet performance) ──────────────────
const CellInput = ({ initialVal, rowIndex, colIndex, onChange, disabled }) => {
  const [localVal, setLocalVal] = useState(initialVal);
  useEffect(() => {
    setLocalVal(initialVal);
  }, [initialVal]);

  return (
    <input
      type="text"
      value={localVal}
      onChange={e => setLocalVal(e.target.value)}
      onBlur={() => onChange(rowIndex, colIndex, localVal)}
      disabled={disabled}
      placeholder={disabled ? "" : "..."}
      style={{
        width: "100%",
        background: "transparent",
        border: "none",
        color: "var(--text-primary)",
        padding: "10px 12px",
        outline: "none",
        fontSize: 13,
        textAlign: "center",
        boxSizing: "border-box"
      }}
    />
  );
};

// ── CUSTOMER PROFILE PAGE ─────────────────────────────────────────
const CustomerProfilePage = ({ customer, allServices, allPayments, t, onBack, onEdit, isAdmin, showToast }) => {
  const [activeTab, setActiveTab] = useState("services");
  const [grid, setGrid] = useState([[""]]);
  const [tableTitle, setTableTitle] = useState("Custom Data Sheet");
  const lastTitle = React.useRef("Custom Data Sheet");
  const sc = STATUS_CONFIG[customer.status] || STATUS_CONFIG.active;

  const myServices = allServices.filter(s => String(s.customerId) === String(customer.id))
    .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));
  const myPayments = allPayments.filter(p => String(p.customerId) === String(customer.id))
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  const totalServiceCost = myServices.reduce((s, x) => s + Number(x.cost || 0), 0);
  const totalPaid = myPayments.reduce((s, x) => s + Number(x.amount || 0), 0);

  const typeColors = { regular: "#38bdf8", repair: "#f59e0b", installation: "#22c55e", emergency: "#ef4444" };
  const fmt = v => `₹${Number(v || 0).toLocaleString("en-IN")}`;

  const addRow = () => {
    setGrid(g => [...g, Array(g[0].length).fill("")]);
  };

  const addCol = () => {
    setGrid(g => g.map(row => [...row, ""]));
  };

  const handleCellChange = (rIdx, cIdx, val) => {
    const oldVal = grid[rIdx][cIdx];
    if (oldVal === val) return;
    setGrid(g => {
      return g.map((row, r) =>
        row.map((cell, c) => (r === rIdx && c === cIdx ? val : cell))
      );
    });
    if (showToast) {
      showToast("Table cell updated!", "success");
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 80 }}>
      {/* Banner */}
      <div style={{ background: "linear-gradient(135deg,#1a1d27,#161922)", borderBottom: "1px solid var(--border)", padding: "20px 16px 24px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "#38bdf808", pointerEvents: "none" }} />
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 12px", cursor: "pointer", marginBottom: 16, color: "var(--text-muted)", fontSize: 13, fontWeight: 600 }}>
          <Icon name="back" size={16} color="var(--text-muted)" /> Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar name={customer.name} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px 0" }}>{customer.name}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: sc.bg, color: sc.color }}>{t[customer.status] || customer.status}</span>
              {customer.paymentStatus === "pending" && <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#ef444418", color: "#ef4444" }}>₹ {t.pending}</span>}
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => onEdit(customer)} style={{ width: 36, height: 36, borderRadius: 10, background: "#38bdf818", border: "1px solid #38bdf830", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Icon name="edit" size={16} color="#38bdf8" />
            </button>
          )}
        </div>

        {/* Quick stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 16 }}>
          {[
            { label: "Services", value: myServices.length, color: "#38bdf8" },
            { label: "Svc Cost", value: fmt(totalServiceCost), color: "#818cf8" },
            { label: "Payments", value: myPayments.length, color: "#22c55e" },
            { label: "Paid", value: fmt(totalPaid), color: "#22c55e" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: s.color, marginTop: 2, fontFamily: "'DM Mono',monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px" }}>
        {/* Info cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Contact</div>
            <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600, marginBottom: 4 }}>{customer.phone}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{customer.area}</div>
            {customer.address && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{customer.address}</div>}
          </div>
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Device</div>
            <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600, marginBottom: 4 }}>{customer.product}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Installed: {customer.installDate}</div>
            <div style={{ fontSize: 11, color: customer.status === "overdue" ? "#ef4444" : customer.status === "due" ? "#f59e0b" : "var(--text-muted)", fontWeight: 600, marginTop: 2 }}>Next: {customer.nextService}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 16, background: "var(--bg-subtle)", borderRadius: 12, padding: 4, border: "1px solid var(--border)" }}>
          {[
            { k: "services", l: `Services (${myServices.length})` },
            { k: "payments", l: `Payments (${myPayments.length})` },
            { k: "datatable", l: "Data Table" }
          ].map(tab => (
            <button key={tab.k} onClick={() => setActiveTab(tab.k)} style={{ flex: 1, padding: "9px 8px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, transition: "all 0.18s", background: activeTab === tab.k ? "var(--card-bg)" : "transparent", color: activeTab === tab.k ? "var(--accent)" : "var(--text-muted)", boxShadow: activeTab === tab.k ? "0 2px 8px #00000030" : "none" }}>{tab.l}</button>
          ))}
        </div>

        {/* Services tab */}
        {activeTab === "services" && (
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 16px" }}>
            {myServices.length === 0
              ? <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: 13 }}>{t.noServices}</div>
              : myServices.map((s, i) => {
                const tc = typeColors[s.serviceType] || "#38bdf8";
                return (
                  <div key={s.id} style={{ display: "flex", gap: 12, paddingBottom: i < myServices.length - 1 ? 16 : 0, marginBottom: i < myServices.length - 1 ? 16 : 0, borderBottom: i < myServices.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${tc}18`, border: `2px solid ${tc}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon name="services" size={15} color={tc} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{t[s.serviceType] || s.serviceType}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: `${tc}18`, color: tc }}>{s.serviceDate}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>{fmt(s.cost)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>👤 {s.technician}</div>
                      {s.notes && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontStyle: "italic" }}>{s.notes}</div>}
                    </div>
                  </div>
                );
              })
            }
          </div>
        )}

        {/* Payments tab */}
        {activeTab === "payments" && (
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 16px" }}>
            {myPayments.length === 0
              ? <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: 13 }}>{t.noPayments}</div>
              : myPayments.map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: i < myPayments.length - 1 ? 14 : 0, marginBottom: i < myPayments.length - 1 ? 14 : 0, borderBottom: i < myPayments.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: "#22c55e18", border: "1px solid #22c55e30", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="payments" size={17} color="#22c55e" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#22c55e" }}>{fmt(p.amount)}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{p.paymentMethod} · {p.paymentDate}</div>
                    {p.paymentFor && <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.paymentFor}</div>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "#22c55e18", color: "#22c55e", flexShrink: 0 }}>Received</span>
                </div>
              ))
            }
          </div>
        )}

        {/* Data Table tab */}
        {activeTab === "datatable" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, animation: "fadeUp 0.25s ease" }}>

            {/* Table Title Editor Row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              {isAdmin ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Table Title</label>
                  <input
                    type="text"
                    value={tableTitle}
                    onChange={(e) => setTableTitle(e.target.value)}
                    onFocus={(e) => {
                      lastTitle.current = e.target.value;
                    }}
                    onBlur={(e) => {
                      if (e.target.value !== lastTitle.current) {
                        if (showToast) showToast("Table title updated!", "success");
                        lastTitle.current = e.target.value;
                      }
                    }}
                    style={{
                      background: "var(--bg-subtle)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "8px 12px",
                      color: "var(--text-primary)",
                      fontSize: 14,
                      fontWeight: 700,
                      outline: "none",
                      width: "100%",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s"
                    }}
                  />
                </div>
              ) : (
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", margin: "8px 0" }}>{tableTitle}</h3>
              )}
            </div>

            {isAdmin && (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={addRow} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: "linear-gradient(135deg,#38bdf8,#818cf8)", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(56,189,248,0.2)" }}>
                  <Icon name="plus" size={14} color="#fff" /> Add Row
                </button>
                <button onClick={addCol} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: "linear-gradient(135deg,#818cf8,#a78bfa)", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(129,140,248,0.2)" }}>
                  <Icon name="plus" size={14} color="#fff" /> Add Column
                </button>
              </div>
            )}

            <div style={{ width: "100%", overflowX: "auto", border: "1px solid var(--border)", borderRadius: 16, background: "var(--card-bg)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
                <thead>
                  <tr style={{ background: "var(--bg-subtle)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ width: 40, padding: 8, fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textAlign: "center", borderRight: "1px solid var(--border)", background: "rgba(120, 120, 120, 0.15)" }}>#</th>
                    {grid[0].map((_, cIdx) => (
                      <th key={cIdx} style={{ padding: 8, fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textAlign: "center", borderRight: cIdx < grid[0].length - 1 ? "1px solid var(--border)" : "none", background: "rgba(120, 120, 120, 0.15)" }}>
                        {String.fromCharCode(65 + cIdx)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, rIdx) => (
                    <tr key={rIdx} style={{ borderBottom: rIdx < grid.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <td style={{ padding: 8, fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textAlign: "center", background: "rgba(120, 120, 120, 0.15)", borderRight: "1px solid var(--border)" }}>
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} style={{ padding: 0, borderRight: cIdx < row.length - 1 ? "1px solid var(--border)" : "none" }}>
                          {isAdmin ? (
                            <CellInput
                              initialVal={cell}
                              rowIndex={rIdx}
                              colIndex={cIdx}
                              onChange={handleCellChange}
                              disabled={false}
                            />
                          ) : (
                            <div style={{
                              width: "100%",
                              padding: "10px 12px",
                              fontSize: 13,
                              textAlign: "center",
                              color: "var(--text-primary)",
                              boxSizing: "border-box",
                              minHeight: "38px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center"
                            }}>
                              <span style={{ wordBreak: "break-word" }}>{cell || "—"}</span>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── CUSTOMER CARD ─────────────────────────────────────────────────
const CustomerCard = ({ customer, t, onEdit, onDelete, onCall, isAdmin }) => {
  const sc = STATUS_CONFIG[customer.status] || STATUS_CONFIG.active;
  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, transition: "transform 0.15s, box-shadow 0.15s", animation: "fadeUp 0.25s ease" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px #0006"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
      <Avatar name={customer.name} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{customer.name}</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: sc.bg, color: sc.color }}>{t[customer.status] || customer.status}</span>
          {customer.paymentStatus === "pending" && (<span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#ef444418", color: "#ef4444" }}>₹ {t.pending}</span>)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
          <Icon name="phone" size={11} color="var(--text-muted)" />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{customer.phone}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <Icon name="location" size={11} color="var(--text-muted)" />
          <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{customer.area}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <Icon name="droplet" size={11} color="var(--accent)" />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{customer.product}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        <button onClick={(e) => { e.stopPropagation(); onCall(customer.phone); }} style={{ width: 32, height: 32, borderRadius: 9, background: "#22c55e18", border: "1px solid #22c55e30", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Icon name="phone" size={14} color="#22c55e" />
        </button>
        {isAdmin && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onEdit(customer); }} style={{ width: 32, height: 32, borderRadius: 9, background: "#38bdf818", border: "1px solid #38bdf830", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Icon name="edit" size={14} color="#38bdf8" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(customer.id); }} style={{ width: 32, height: 32, borderRadius: 9, background: "#ef444418", border: "1px solid #ef444430", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Icon name="trash" size={14} color="#ef4444" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ── CUSTOMERS PAGE ────────────────────────────────────────────────
const CustomersPage = ({ t, customers, setCustomers, showToast, allServices, allPayments, isAdmin }) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editData, setEditData] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [profileCustomer, setProfileCustomer] = useState(null);

  // Show profile view
  if (profileCustomer) {
    const fresh = customers.find(c => c.id === profileCustomer.id) || profileCustomer;
    return <CustomerProfilePage customer={fresh} allServices={allServices} allPayments={allPayments} t={t}
      onBack={() => setProfileCustomer(null)}
      onEdit={(c) => { setProfileCustomer(null); setEditData(c); setShowForm(true); }}
      isAdmin={isAdmin}
      showToast={showToast}
    />;
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.area.toLowerCase().includes(q);
    const matchFilter = filter === "all" || c.status === filter || (filter === "pending" && c.paymentStatus === "pending");
    return matchSearch && matchFilter;
  });

  const handleSave = (form) => {
    if (editData) { setCustomers(cs => cs.map(c => c.id === editData.id ? { ...form, id: editData.id } : c)); }
    else { setCustomers(cs => [{ ...form, id: Date.now() }, ...cs]); }
    showToast(t.customerAdded, "success");
    setShowForm(false); setEditData(null);
  };
  const handleDelete = (id) => { setCustomers(cs => cs.filter(c => c.id !== id)); setDeleteConfirm(null); showToast(t.customerDeleted, "success"); };

  const FILTERS = [
    { key: "all", label: t.allStatus }, { key: "active", label: t.active },
    { key: "due", label: t.due }, { key: "overdue", label: t.overdue }, { key: "pending", label: t.pending },
  ];

  return (
    <div style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>{t.customers}</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{filtered.length} {t.totalCount}</div>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditData(null); setShowForm(true); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 12, background: "linear-gradient(135deg, #38bdf8, #818cf8)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #38bdf840" }}>
            <Icon name="plus" size={16} color="#fff" /> {t.addCustomer}
          </button>
        )}
      </div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="search" size={16} color="var(--text-muted)" /></div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchPlaceholder} style={{ width: "100%", padding: "11px 12px 11px 38px", background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text-primary)", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 4 }}><Icon name="close" size={14} color="var(--text-muted)" /></button>}
      </div>
      <div style={{ display: "flex", gap: 7, marginBottom: 18, overflowX: "auto", paddingBottom: 2 }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", borderColor: filter === f.key ? "var(--accent)" : "var(--border)", background: filter === f.key ? "#38bdf818" : "var(--card-bg)", color: filter === f.key ? "var(--accent)" : "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{f.label}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--text-muted)" }}>
          <Icon name="customers" size={40} color="var(--border)" />
          <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>{t.noCustomers}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#38bdf808", border: "1px solid #38bdf820", borderRadius: 10, marginBottom: 2 }}>
            <Icon name="user" size={13} color="var(--accent)" />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Tap a customer card to view full profile</span>
          </div>
          {filtered.map(c => (
            <div key={c.id} onClick={() => setProfileCustomer(c)} style={{ cursor: "pointer" }}>
              <CustomerCard customer={c} t={t} onEdit={e => { setEditData(e); setShowForm(true); }} onDelete={id => setDeleteConfirm(id)} onCall={p => window.open(`tel:${p}`)} isAdmin={isAdmin} />
            </div>
          ))}
        </div>
      )}
      {isAdmin && showForm && <CustomerForm t={t} onSave={handleSave} onClose={() => { setShowForm(false); setEditData(null); }} editData={editData} />}
      {isAdmin && deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "#00000085", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: 24, maxWidth: 300, width: "90%", border: "1px solid var(--border)", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#ef444420", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Icon name="trash" size={22} color="#ef4444" /></div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{t.confirmDelete}</div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t.cancel}</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "#ef4444", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── DASHBOARD ─────────────────────────────────────────────────────
const StatCard = ({ label, value, color, icon }) => (
  <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 18px", display: "flex", flexDirection: "column", gap: 10, position: "relative", overflow: "hidden", transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 24px ${color}33`; }}
    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
    <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: `${color}18`, pointerEvents: "none" }} />
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={18} color={color} />
      </div>
    </div>
    <div style={{ fontSize: 32, fontWeight: 800, color: "var(--text-primary)", fontFamily: "'DM Mono', monospace", letterSpacing: "-1px" }}>{value}</div>
  </div>
);

const DashboardPage = ({ t, customers, services, payments, sales }) => {
  const stats = {
    totalCustomers: customers.length,
    dueThisWeek: customers.filter(c => c.status === "due").length,
    pendingPayments: customers.filter(c => c.paymentStatus === "pending").length,
    activeServices: customers.filter(c => c.status === "active").length,
  };
  const totalRevenue = payments.reduce((s, p) => s + p.amount, 0) + sales.reduce((s, x) => s + x.total, 0);

  return (
    <div style={{ padding: "24px 20px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{t.welcome} 👋</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>{t.todayStats}</h1>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
        <StatCard label={t.totalCustomers} value={stats.totalCustomers} color="#3b82f6" icon="customers" />
        <StatCard label={t.dueThisWeek} value={stats.dueThisWeek} color="#f59e0b" icon="calendar" />
        <StatCard label={t.pendingPayments} value={stats.pendingPayments} color="#ef4444" icon="payments" />
        <StatCard label={t.activeServices} value={stats.activeServices} color="#22c55e" icon="services" />
      </div>
      {/* Revenue banner */}
      <div style={{ background: "linear-gradient(135deg,#38bdf820,#818cf820)", border: "1px solid #38bdf840", borderRadius: 16, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Revenue</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{fmt(totalRevenue)}</div>
        </div>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "linear-gradient(135deg,#38bdf8,#818cf8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="rupee" size={24} color="#fff" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="trend_up" size={16} color="var(--accent)" /> {t.recentActivity}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {DUMMY_ACTIVITY.map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.action}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{item.time}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="reminders" size={16} color="#f59e0b" /> {t.upcomingDues}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {customers.filter(c => c.status === "due" || c.status === "overdue").slice(0, 4).map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 10, background: c.status === "overdue" ? "#ef444415" : "#f59e0b10", border: c.status === "overdue" ? "1px solid #ef444330" : "1px solid #f59e0b20" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.area}</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: c.status === "overdue" ? "#ef4444" : "#f59e0b", color: "#fff" }}>{c.nextService}</div>
              </div>
            ))}
            {customers.filter(c => c.status === "due" || c.status === "overdue").length === 0 && (
              <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>{t.noDues}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── LOGIN PAGE ────────────────────────────────────────────────────
const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const { executeRecaptcha } = useGoogleReCaptcha();

  const [focusedField, setFocusedField] = useState(null);
  const [isLoginHovered, setIsLoginHovered] = useState(false);
  const [isGoogleHovered, setIsGoogleHovered] = useState(false);

  // System Dark Theme Detection
  const [isSystemDark, setIsSystemDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => setIsSystemDark(e.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError("Please enter email and password."); return; }
    setLoading(true); setError("");

    // Programmatically execute reCAPTCHA v3 before login logic
    if (!executeRecaptcha) {
      setError("Security check is initializing. Please try again in a moment.");
      setLoading(false);
      return;
    }

    try {
      const token = await executeRecaptcha("login");
      console.log("reCAPTCHA v3 secure token obtained successfully:", token);
    } catch (rcError) {
      console.error("reCAPTCHA v3 error:", rcError);
      setError("Security verification failed. Please refresh and try again.");
      setLoading(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      const msgs = {
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Wrong password. Try again.",
        "auth/invalid-email": "Invalid email address.",
        "auth/too-many-requests": "Too many attempts. Wait a moment.",
        "auth/invalid-credential": "Invalid email or password.",
      };
      setError(msgs[e.code] || e.message);
    }
    setLoading(false);
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password) { setError("Please enter email and password."); return; }
    setLoading(true); setError("");

    if (!executeRecaptcha) {
      setError("Security check is initializing. Please try again in a moment.");
      setLoading(false);
      return;
    }

    try {
      const token = await executeRecaptcha("signup");
      console.log("reCAPTCHA v3 secure token obtained successfully:", token);
    } catch (rcError) {
      console.error("reCAPTCHA v3 error:", rcError);
      setError("Security verification failed. Please refresh and try again.");
      setLoading(false);
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      const msgs = {
        "auth/email-already-in-use": "This email is already in use.",
        "auth/weak-password": "The password is too weak. (Minimum 6 characters required)",
        "auth/invalid-email": "Invalid email address.",
        "auth/operation-not-allowed": "Email/password accounts are not enabled.",
      };
      setError(msgs[e.code] || e.message);
    }
    setLoading(false);
  };

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isSignUp) {
      handleSignUp();
    } else {
      handleLogin();
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");

    // Programmatically execute reCAPTCHA v3 before Google Sign-In logic
    if (!executeRecaptcha) {
      setError("Security check is initializing. Please try again in a moment.");
      setLoading(false);
      return;
    }

    try {
      const token = await executeRecaptcha("google_login");
      console.log("reCAPTCHA v3 Google Sign-In secure token obtained successfully:", token);
    } catch (rcError) {
      console.error("reCAPTCHA v3 error:", rcError);
      setError("Security verification failed. Please refresh and try again.");
      setLoading(false);
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // Dynamic Theme Definitions Scoped exclusively inside LoginPage
  const colors = {
    bg: isSystemDark ? "linear-gradient(135deg, #080c14 0%, #0e1320 100%)" : "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)",
    cardBg: isSystemDark ? "rgba(15, 23, 42, 0.65)" : "#ffffff",
    cardBorder: isSystemDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(226, 232, 240, 0.8)",
    cardShadow: isSystemDark ? "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)" : "0 25px 50px -12px rgba(15, 23, 42, 0.08), 0 0 50px rgba(0, 0, 0, 0.01), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
    logoBg: isSystemDark ? "linear-gradient(135deg, #06b6d4, #0891b2)" : "linear-gradient(135deg, #0284c7, #3b82f6)",
    logoShadow: isSystemDark ? "0 8px 24px rgba(6, 182, 212, 0.3)" : "0 8px 24px rgba(2, 132, 199, 0.2)",
    title: isSystemDark ? "#ffffff" : "#0f172a",
    subtitle: isSystemDark ? "#94a3b8" : "#64748b",
    label: isSystemDark ? "#94a3b8" : "#475569",
    inputBg: isSystemDark ? "rgba(9, 13, 22, 0.7)" : "#ffffff",
    inputBorder: (fieldName, hasError) => {
      if (hasError) return "2px solid #ef4444";
      if (focusedField === fieldName) return isSystemDark ? "2px solid #06b6d4" : "2px solid #3b82f6";
      return isSystemDark ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #cbd5e1";
    },
    inputColor: isSystemDark ? "#f1f5f9" : "#0f172a",
    inputFocusShadow: isSystemDark ? "0 0 0 4px rgba(6, 182, 212, 0.25)" : "0 0 0 4px rgba(59, 130, 246, 0.12)",
    buttonBg: loading ? (isSystemDark ? "#083344" : "#93c5fd") : (isSystemDark ? (isLoginHovered ? "#087ea4" : "#06b6d4") : (isLoginHovered ? "#1d4ed8" : "#2563eb")),
    buttonColor: isSystemDark ? "#082f49" : "#ffffff",
    buttonShadow: isSystemDark
      ? (isLoginHovered && !loading ? "0 8px 24px rgba(6, 182, 212, 0.4)" : "0 4px 12px rgba(6, 182, 212, 0.25)")
      : (isLoginHovered && !loading ? "0 8px 20px rgba(37, 99, 235, 0.3)" : "0 4px 12px rgba(37, 99, 235, 0.15)"),
    dividerLine: isSystemDark ? "rgba(255, 255, 255, 0.1)" : "#e2e8f0",
    dividerText: isSystemDark ? "rgba(255, 255, 255, 0.4)" : "#94a3b8",
    googleBg: isSystemDark ? (isGoogleHovered ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.04)") : (isGoogleHovered ? "#f8fafc" : "#ffffff"),
    googleBorder: isSystemDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #cbd5e1",
    googleText: isSystemDark ? "#f1f5f9" : "#334155",
    googleShadow: isSystemDark ? "none" : (isGoogleHovered && !loading ? "0 6px 16px rgba(0, 0, 0, 0.05)" : "none"),
    errBg: isSystemDark ? "rgba(239, 68, 68, 0.1)" : "#fef2f2",
    errBorder: isSystemDark ? "rgba(239, 68, 68, 0.3)" : "#fca5a5",
    errText: isSystemDark ? "#f87171" : "#b91c1c",
    hintBg: isSystemDark ? "rgba(245, 158, 11, 0.1)" : "#fffbeb",
    hintBorder: isSystemDark ? "rgba(245, 158, 11, 0.3)" : "#fde68a",
    hintText: isSystemDark ? "#fbbf24" : "#b45309",
    metaText: isSystemDark ? "rgba(255, 255, 255, 0.4)" : "#64748b"
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: colors.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      boxSizing: "border-box",
      transition: "background 0.3s ease"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        :root{font-family:'Sora',sans-serif;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(24px);}to{opacity:1;transform:translateY(0);}}
      `}</style>

      <div style={{
        width: "100%",
        maxWidth: 420,
        animation: "fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        display: "flex",
        flexDirection: "column",
        gap: 24
      }}>
        {/* Card */}
        <div style={{
          background: colors.cardBg,
          backdropFilter: isSystemDark ? "blur(16px)" : "none",
          WebkitBackdropFilter: isSystemDark ? "blur(16px)" : "none",
          border: colors.cardBorder,
          borderRadius: 24,
          padding: "40px 32px",
          boxShadow: colors.cardShadow,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          boxSizing: "border-box",
          transition: "all 0.3s ease"
        }}>
          {/* Logo & Header */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: colors.logoBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: colors.logoShadow,
              marginBottom: 16,
              transition: "background 0.3s ease"
            }}>
              <Icon name="water" size={26} color={isSystemDark ? "#082f49" : "#fff"} />
            </div>
            <h1 style={{
              fontSize: 22,
              fontWeight: 800,
              color: colors.title,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              margin: 0,
              transition: "color 0.3s ease"
            }}>AQUACARE</h1>
            <p style={{
              fontSize: 13,
              color: colors.subtitle,
              fontWeight: 500,
              marginTop: 6,
              transition: "color 0.3s ease"
            }}>Secure Service Management Portal</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Email */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: colors.label, letterSpacing: "0.05em", transition: "color 0.3s ease" }}>EMAIL ADDRESS</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@yourbusiness.com"
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  background: colors.inputBg,
                  border: colors.inputBorder("email", error),
                  borderRadius: 12,
                  color: colors.inputColor,
                  fontSize: 14,
                  fontWeight: 500,
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "all 0.2s ease",
                  boxShadow: focusedField === "email" && !error ? colors.inputFocusShadow : "none"
                }}
              />
            </div>

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: colors.label, letterSpacing: "0.05em", transition: "color 0.3s ease" }}>PASSWORD</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  style={{
                    width: "100%",
                    padding: "14px 48px 14px 16px",
                    background: colors.inputBg,
                    border: colors.inputBorder("password", error),
                    borderRadius: 12,
                    color: colors.inputColor,
                    fontSize: 14,
                    fontWeight: 500,
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "all 0.2s ease",
                    boxShadow: focusedField === "password" && !error ? colors.inputFocusShadow : "none"
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: colors.label,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    transition: "color 0.3s ease"
                  }}
                >
                  {showPass ? "HIDE" : "SHOW"}
                </button>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div style={{
                background: colors.errBg,
                border: `1px solid ${colors.errBorder}`,
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 13,
                color: colors.errText,
                display: "flex",
                alignItems: "center",
                gap: 8,
                animation: "fadeUp 0.2s ease",
                transition: "all 0.3s ease"
              }}>
                <Icon name="alert" size={16} color={colors.errText} />
                <span style={{ fontWeight: 500 }}>{error}</span>
              </div>
            )}

            {/* Login button */}
            <button
              type="submit"
              disabled={loading}
              onMouseEnter={() => setIsLoginHovered(true)}
              onMouseLeave={() => setIsLoginHovered(false)}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                background: colors.buttonBg,
                border: "none",
                color: colors.buttonColor,
                fontSize: 14,
                fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: colors.buttonShadow,
                transform: isLoginHovered && !loading ? "translateY(-1px)" : "translateY(0)",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                outline: "none"
              }}
            >
              {loading ? (isSignUp ? "Signing up..." : "Signing in…") : (isSignUp ? "Sign Up" : "Log In")}
            </button>

            {/* Toggle Sign Up / Log In */}
            <div style={{ textAlign: "center", marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(v => !v);
                  setError("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: isSystemDark ? "#06b6d4" : "#2563eb",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "underline",
                  outline: "none",
                  transition: "color 0.2s ease"
                }}
              >
                {isSignUp ? "Already have an account? Log In" : "Don't have an account? Sign Up"}
              </button>
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0", color: colors.dividerText, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", transition: "color 0.3s ease" }}>
              <div style={{ flex: 1, height: 1, background: colors.dividerLine, transition: "background 0.3s ease" }} />
              OR
              <div style={{ flex: 1, height: 1, background: colors.dividerLine, transition: "background 0.3s ease" }} />
            </div>

            {/* Google Sign-in */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              onMouseEnter={() => setIsGoogleHovered(true)}
              onMouseLeave={() => setIsGoogleHovered(false)}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: 12,
                background: colors.googleBg,
                border: colors.googleBorder,
                color: colors.googleText,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                boxShadow: colors.googleShadow,
                transform: isGoogleHovered && !loading ? "translateY(-1px)" : "translateY(0)",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                outline: "none"
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </button>

            {/* Hint if Firebase not configured */}
            {!FB_READY && (
              <div style={{
                marginTop: 8,
                padding: "10px 14px",
                background: colors.hintBg,
                border: "1px solid",
                borderColor: colors.hintBorder,
                borderRadius: 10,
                fontSize: 12,
                color: colors.hintText,
                textAlign: "center",
                fontWeight: 500,
                transition: "all 0.3s ease"
              }}>
                ⚠️ Firebase not configured yet — fill in FIREBASE_CONFIG to enable login
              </div>
            )}
          </form>
        </div>

        <div style={{ textAlign: "center", fontSize: 12, color: colors.metaText, fontWeight: 500, transition: "color 0.3s ease" }}>
          AquaCare CRM Portal v6.0 · Secured with Firebase Enterprise Auth
        </div>
      </div>
    </div>
  );
};

// ── SYNC BADGE ────────────────────────────────────────────────────
const SyncBadge = ({ syncing, error, userId }) => {
  if (!FB_READY || !userId) return (
    <div title="Using local storage" style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "#f59e0b18", border: "1px solid #f59e0b30" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b" }}>LOCAL</span>
    </div>
  );
  if (error) return (
    <div title={error} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "#ef444418", border: "1px solid #ef444430" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>OFFLINE</span>
    </div>
  );
  if (syncing) return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "#38bdf818", border: "1px solid #38bdf830" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#38bdf8", animation: "pulse 1s infinite" }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: "#38bdf8" }}>SYNCING</span>
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "#22c55e18", border: "1px solid #22c55e30" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e" }}>SYNCED</span>
    </div>
  );
};

// ── LANG LIST ─────────────────────────────────────────────────────
const LANGS = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "bn", label: "বাংলা", flag: "🇧🇩" },
  { code: "hi", label: "हिंदी", flag: "🇮🇳" },
];

// ══════════════════════════════════════════════════════════════════
// ── MAIN APP ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
export default function ServiceBook() {
  // ── AUTH STATE ────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const userId = currentUser?.uid || null;

  // Define strict role-based access control
  const isAdmin = currentUser?.email === "aquacareadmin@gmail.com";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (u) {
        setCurrentUser(u);
      } else {
        setCurrentUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    if (!window.confirm("Are you sure you want to log out?")) return false;
    try {
      await signOut(auth);
      return true;
    } catch (e) {
      console.error("Logout failed:", e);
      return false;
    }
  };

  // ── APP STATE (Firestore-synced, localStorage fallback) ───────
  const [activePage, setActivePage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lang, setLang] = useLocalStorage("ac_lang", "en");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const [customers, setCustomers, custSyncing, custErr] = useFirestoreCollection("customers", "ac_customers", INITIAL_CUSTOMERS, userId);
  const [services, setServices, svcSyncing] = useFirestoreCollection("services", "ac_services", INITIAL_SERVICES, userId);
  const [payments, setPayments, paySync] = useFirestoreCollection("payments", "ac_payments", INITIAL_PAYMENTS, userId);
  const [reminders, setReminders] = useFirestoreCollection("reminders", "ac_reminders", INITIAL_REMINDERS, userId);
  const [sales, setSales, salesSync] = useFirestoreCollection("sales", "ac_sales", INITIAL_SALES, userId);

  const syncing = custSyncing || svcSyncing || paySync || salesSync;
  const syncError = custErr;

  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const navItems = [
    { id: "dashboard", label: t.dashboard, icon: "dashboard" },
    { id: "customers", label: t.customers, icon: "customers" },
    { id: "services", label: t.services, icon: "services" },
    { id: "payments", label: t.payments, icon: "payments" },
    { id: "sales", label: t.sales, icon: "sales" },
    { id: "reminders", label: t.reminders, icon: "reminders" },
    { id: "settings", label: t.settings, icon: "settings" },
  ];

  const renderPage = () => {
    switch (activePage) {
      case "dashboard": return <DashboardPage t={t} customers={customers} services={services} payments={payments} sales={sales} />;
      case "customers": return <CustomersPage t={t} customers={customers} setCustomers={setCustomers} showToast={showToast} allServices={services} allPayments={payments} isAdmin={isAdmin} />;
      case "services": return <ServicesPage t={t} customers={customers} services={services} setServices={setServices} showToast={showToast} isAdmin={isAdmin} />;
      case "payments": return <PaymentsPage t={t} customers={customers} payments={payments} setPayments={setPayments} showToast={showToast} isAdmin={isAdmin} />;
      case "sales": return <SalesPage t={t} customers={customers} sales={sales} setSales={setSales} showToast={showToast} isAdmin={isAdmin} />;
      case "reminders": return <RemindersPage t={t} customers={customers} reminders={reminders} setReminders={setReminders} showToast={showToast} isAdmin={isAdmin} />;
      case "settings": return <SettingsPage t={t} lang={lang} setLang={setLang} showToast={showToast} customers={customers} services={services} payments={payments} sales={sales} user={currentUser} onLogout={handleLogout} isAdmin={isAdmin} />;
      default: return null;
    }
  };

  // ── AUTH LOADING SPINNER ──────────────────────────────────────
  if (authLoading) return (
    <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@800&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#0f1117;}@keyframes spin{to{transform:rotate(360deg);}}`}</style>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: "linear-gradient(135deg,#38bdf8,#818cf8)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 32px #38bdf840" }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6 8 4 12.5 4 15a8 8 0 0 0 16 0c0-2.5-2-7-8-13z" /></svg>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#f1f5f9", fontFamily: "Sora,sans-serif" }}>AquaCare</div>
      <div style={{ width: 32, height: 32, border: "3px solid #2a2d3a", borderTop: "3px solid #38bdf8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  // ── LOGIN GATE — show login screen if no user ──
  if (!currentUser) return (
    <GoogleReCaptchaProvider reCaptchaKey="6LeYVwctAAAAAOhKn3VtWYVAtXYuoxAkH2qEuY3w">
      <LoginPage />
    </GoogleReCaptchaProvider>
  );

  // bottom nav: show 5 most important pages
  const bottomNav = ["dashboard", "customers", "services", "payments", "sales"];

  return (
    <GoogleReCaptchaProvider reCaptchaKey="6LeYVwctAAAAAOhKn3VtWYVAtXYuoxAkH2qEuY3w">
      <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        .grecaptcha-badge { visibility: hidden !important; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0f1117; --bg-subtle: #1a1d27; --card-bg: #161922;
          --border: #2a2d3a; --accent: #38bdf8; --accent2: #818cf8;
          --text-primary: #f1f5f9; --text-muted: #64748b;
          --sidebar-w: 220px; --header-h: 58px;
          font-family: 'Sora', sans-serif;
        }
        body { background: var(--bg); color: var(--text-primary); min-height: 100vh; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
        input, select, textarea { font-family: 'Sora', sans-serif; }
        .nav-item { display: flex; align-items: center; gap: 11px; padding: 10px 14px; border-radius: 11px; cursor: pointer; font-size: 14px; font-weight: 500; color: var(--text-muted); transition: all 0.18s; border: 1px solid transparent; user-select: none; }
        .nav-item:hover { background: var(--bg-subtle); color: var(--text-primary); }
        .nav-item.active { background: linear-gradient(135deg,#38bdf815,#818cf815); color: var(--accent); border-color: #38bdf820; font-weight: 600; }
        .overlay { position: fixed; inset: 0; background: #00000080; z-index: 40; backdrop-filter: blur(2px); }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideUp { from { transform:translateY(100%); } to { transform:translateY(0); } }
        .page-anim { animation: fadeUp 0.3s ease forwards; }
        button:active { opacity: 0.8; transform: scale(0.97); }
        @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        @keyframes spin   { to { transform: rotate(360deg); } }
        .clickable-card {
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .clickable-card:hover {
          transform: translateY(-2px) scale(1.01) !important;
          box-shadow: 0 8px 24px rgba(56, 189, 248, 0.3) !important;
          border-color: var(--accent) !important;
        }
        .clickable-card:active {
          transform: translateY(0) scale(0.98) !important;
          box-shadow: 0 4px 12px rgba(56, 189, 248, 0.15) !important;
        }
        .grid-2-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .premium-detail-card {
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 28px 24px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.5);
        }
        @media (max-width: 480px) {
          .grid-2-col {
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .premium-detail-card {
            padding: 20px 16px;
            border-radius: 20px;
          }
        }

        /* ── SYSTEM DARK MODE OVERRIDES (Neon Aqua Glassmorphism Theme) ── */
        @media (prefers-color-scheme: dark) {
          :root {
            --bg: #060913;
            --bg-subtle: rgba(9, 13, 22, 0.5);
            --card-bg: rgba(15, 23, 42, 0.6);
            --border: rgba(255, 255, 255, 0.08);
            --accent: #06b6d4;  /* vibrant Neon Aqua */
            --accent2: #0891b2; /* glowing dark Aqua */
            --text-primary: #ffffff;
            --text-muted: #94a3b8;
          }
          
          body {
            background: linear-gradient(135deg, #060913 0%, #0e1322 100%) !important;
            background-attachment: fixed !important;
          }

          /* Glassmorphism containers with blur(12px) */
          aside, header, nav, .premium-detail-card, .clickable-card, 
          div[style*="background: var(--card-bg)"], 
          div[style*="background:var(--card-bg)"],
          div[style*="background: var(--card-bg)"] {
            background: rgba(15, 23, 42, 0.6) !important;
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
            border-color: rgba(255, 255, 255, 0.08) !important;
          }

          /* Cards hover highlights */
          .clickable-card:hover {
            box-shadow: 0 10px 30px rgba(6, 182, 212, 0.2) !important;
            border-color: var(--accent) !important;
          }

          /* Inputs, Select, Textareas */
          input, select, textarea {
            background: rgba(9, 13, 22, 0.75) !important;
            border-color: rgba(255, 255, 255, 0.15) !important;
            color: #ffffff !important;
          }
          
          input:focus, select:focus, textarea:focus {
            border-color: var(--accent) !important;
            box-shadow: 0 0 0 4px rgba(6, 182, 212, 0.2) !important;
          }

          /* Transparent spreadsheets */
          table, tr, td {
            background: transparent !important;
          }

          /* Spreadsheet coordinates headers */
          th[style*="rgba(120, 120, 120, 0.15)"], 
          td[style*="rgba(120, 120, 120, 0.15)"] {
            background: rgba(255, 255, 255, 0.05) !important;
            color: #94a3b8 !important;
            border-color: rgba(255, 255, 255, 0.08) !important;
          }

          /* Active navigation links sidebar */
          .nav-item.active {
            background: rgba(6, 182, 212, 0.12) !important;
            color: #06b6d4 !important;
            border-color: rgba(6, 182, 212, 0.2) !important;
          }

          /* Active tab buttons in dashboard */
          button[style*="var(--card-bg)"] {
            background: rgba(15, 23, 42, 0.8) !important;
            border-color: var(--accent) !important;
            color: var(--accent) !important;
          }

          /* Glow accent gradients on primary action buttons */
          button[style*="linear-gradient"] {
            background: linear-gradient(135deg, #06b6d4, #0891b2) !important;
            color: #082f49 !important;
            box-shadow: 0 4px 12px rgba(6, 182, 212, 0.25) !important;
          }
          button[style*="linear-gradient"]:hover {
            box-shadow: 0 6px 20px rgba(6, 182, 212, 0.4) !important;
          }

          /* Active progress bars color */
          div[style*="background: var(--accent2)"],
          div[style*="background:var(--accent2)"] {
            background: #06b6d4 !important;
          }

          /* Ensure all inputs inside coordinate cells look pristine */
          td input {
            color: #ffffff !important;
          }
        }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh" }}>
        {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

        {/* SIDEBAR */}
        <aside style={{ width: "var(--sidebar-w)", background: "var(--card-bg)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 50, transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform 0.25s cubic-bezier(.4,0,.2,1)" }}>
          <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#38bdf8,#818cf8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="water" size={20} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{t.appName}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.05em" }}>{t.appSubtitle}</div>
              </div>
            </div>
          </div>
          <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
            {navItems.map(item => (
              <div key={item.id} className={`nav-item ${activePage === item.id ? "active" : ""}`} onClick={() => { setActivePage(item.id); setSidebarOpen(false); }}>
                <Icon name={item.icon} size={17} color={activePage === item.id ? "var(--accent)" : "var(--text-muted)"} />
                {item.label}
              </div>
            ))}
          </nav>
          <div style={{ padding: "12px 10px", borderTop: "1px solid var(--border)", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 11, cursor: "pointer", background: "var(--bg-subtle)", border: "1px solid var(--border)" }} onClick={() => setShowLangMenu(v => !v)}>
              <Icon name="globe" size={15} color="var(--text-muted)" />
              <span style={{ fontSize: 13, color: "var(--text-muted)", flex: 1 }}>
                {LANGS.find(l => l.code === lang)?.flag} {LANGS.find(l => l.code === lang)?.label}
              </span>
            </div>
            {showLangMenu && (
              <div style={{ position: "absolute", bottom: "100%", left: 10, right: 10, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 4, boxShadow: "0 -8px 24px #00000060" }}>
                {LANGS.map(l => (
                  <div key={l.code} onClick={() => { setLang(l.code); setShowLangMenu(false); }}
                    style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500, color: lang === l.code ? "var(--accent)" : "var(--text-primary)", background: lang === l.code ? "#38bdf810" : "transparent", transition: "background 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--bg-subtle)"}
                    onMouseLeave={e => e.currentTarget.style.background = lang === l.code ? "#38bdf810" : "transparent"}
                  >{l.flag} {l.label}</div>
                ))}
              </div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 14px",
                borderRadius: 11,
                cursor: "pointer",
                background: "#ef444415",
                border: "1px solid #ef444430",
                marginTop: 8,
                color: "#ef4444"
              }}
              onClick={handleLogout}
            >
              <Icon name="logout" size={15} color="#ef4444" />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
                Logout
              </span>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
          <header style={{ height: "var(--header-h)", background: "var(--card-bg)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 16px", position: "sticky", top: 0, zIndex: 30, gap: 12 }}>
            <button onClick={() => setSidebarOpen(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex", alignItems: "center" }}>
              <Icon name={sidebarOpen ? "close" : "menu"} size={22} color="var(--text-primary)" />
            </button>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{navItems.find(n => n.id === activePage)?.label}</span>
            </div>
            <SyncBadge syncing={syncing} error={syncError} userId={userId} />
            
            {/* Gmail-Style Profile Dropdown Trigger */}
            <div style={{ position: "relative", zIndex: 100 }}>
              <div 
                className="user-profile-trigger"
                onClick={() => setUserMenuOpen(v => !v)}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#38bdf8,#818cf8)",
                  border: "2px solid var(--accent, #38bdf8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  fontWeight: "700",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
                title="Account Settings"
              >
                {/* Derived initials for the trigger avatar */}
                {currentUser?.displayName ? (
                  currentUser.displayName.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("").toUpperCase()
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </div>

              {userMenuOpen && (
                <>
                  {/* Click outside backdrop overlay to dismiss the popover */}
                  <div 
                    style={{ position: "fixed", inset: 0, zIndex: 999, background: "transparent" }} 
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="gmail-popover" style={{ zIndex: 1000 }}>
                    <div className="popover-header">
                      <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                        Signed In As
                      </div>
                      <UserAccountHeader user={currentUser} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", padding: "10px 12px" }} />
                    </div>
                    <div className="popover-body">
                      <button 
                        className="popover-action-btn popover-btn-primary" 
                        onClick={() => { setActivePage("settings"); setUserMenuOpen(false); }}
                      >
                        ⚙️ {t.settings}
                      </button>
                      <button 
                        className="popover-action-btn popover-btn-secondary" 
                        onClick={async () => {
                          setUserMenuOpen(false);
                          await handleLogout();
                        }}
                      >
                        <Icon name="logout" size={14} color="#ef4444" /> Sign Out
                      </button>
                    </div>
                    <div className="popover-footer">
                      AquaCare • {t.version}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#38bdf8,#818cf8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="water" size={16} color="#fff" />
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>{t.appName}</span>
            </div>
          </header>

          <main className="page-anim" key={activePage} style={{ flex: 1, overflowY: "auto" }}>
            {renderPage()}
          </main>

          {/* BOTTOM NAV — shows top 5 pages */}
          <nav style={{ position: "sticky", bottom: 0, background: "var(--card-bg)", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-around", padding: "8px 0", zIndex: 30 }}>
            {navItems.filter(n => bottomNav.includes(n.id)).map(item => (
              <div key={item.id} onClick={() => setActivePage(item.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 8px", borderRadius: 10, cursor: "pointer", color: activePage === item.id ? "var(--accent)" : "var(--text-muted)", transition: "color 0.15s" }}>
                <Icon name={item.icon} size={20} color={activePage === item.id ? "var(--accent)" : "var(--text-muted)"} />
                <span style={{ fontSize: 9, fontWeight: activePage === item.id ? 700 : 400 }}>{item.label}</span>
              </div>
            ))}
          </nav>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </>
    </GoogleReCaptchaProvider>
  );
}
