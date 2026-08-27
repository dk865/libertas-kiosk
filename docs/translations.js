const en = {
  appName: "libertas café",
  startupTitle: "Connect libertas café kiosk",
  startupSubtitle: "Enter backend address for this session",
  backendAddress: "Backend URL",
  testConnection: "Test connection",
  continueToKiosk: "Continue",
  connectionSuccess: "Connection successful.",
  connectionFail: "Unable to reach backend.",
  welcomeTitle: "Welcome to libertas café",
  welcomeSubtitle: "What name should we use for your order?",
  yourName: "Your name",
  continue: "Continue",
  menuHeading: "Menu",
  bag: "Bag",
  unavailable: "Unavailable",
  addToBag: "Add to bag",
  checkout: "Checkout",
  placeOrder: "Place order",
  paymentMethod: "Payment method",
  cash: "Cash",
  starCards: "Star cards",
  starCardId: "Student ID for star cards",
  finalConfirm: "Confirm order",
  back: "Back",
  orderReceived: "Order received!",
  thankYou: "Thank you for visiting libertas café.",
  cashierView: "Cashier",
  kdsView: "Kitchen display",
  markPaid: "Mark paid",
  startPreparing: "Start preparing",
  markCompleted: "Mark completed"
};

export function t(key) {
  return en[key] || key;
}
