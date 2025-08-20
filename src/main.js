import { initUI, renderAll } from "./ui.js";
import { setupEventListeners } from "./events.js";

/**
 * Main application entry point.
 */
function main() {
  // Initialize UI components first
  initUI();
  
  // Setup all user event listeners
  setupEventListeners();
  
  // Perform the initial render of the application
  renderAll();
  
  console.log("ES-8 Sequencer application initialized.");
}

// Run the application after the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', main);