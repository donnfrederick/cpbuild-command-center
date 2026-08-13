/**
 * Site Tour Steps — CP Build Field Tracker
 *
 * These are the hardcoded steps for the full site walkthrough tour shown to
 * first-time users. They are versioned with the code so updates ship with the
 * next deploy.
 *
 * Voice: Filipino English (en-PH) via Web Speech API, warm and natural pacing.
 * All voiceText strings are written for a conversational narrator cadence —
 * keep them to 1–2 sentences so each step doesn't feel like a lecture.
 *
 * pageUrl: locale-agnostic paths (e.g. "/", "/projects"). The TourPlayer
 * prepends the active locale at runtime before navigating.
 * {{PROJECT_ID}} is replaced at runtime with TOUR_DEMO_PROJECT_ID.
 *
 * elementSelector: CSS selector for the element to highlight. Keep selectors
 * stable — prefer IDs and data-tour attributes over deeply nested class
 * chains. If the selector doesn't match on the page the highlight is simply
 * omitted (tour still plays).
 *
 * Steps 5–7 walk through the Add Project wizard + Field Tracker upload:
 *   Step 5: click the Add Project button — modal opens.
 *   Step 6: dispatch tour:run-full-wizard-no-upm — modal selects a Unifier
 *            project, confirms details, and creates the project in ~2 s with
 *            no Field Tracker attached yet. Modal closes automatically.
 *            cleanupOnLeave:"escape" handles the case where the user skips.
 *   Step 7: navigate to /projects/{{PROJECT_ID}}/units, then dispatch
 *            tour:simulate-field-tracker-upload — UnitsPageClient shows a
 *            progress overlay while units stream in, then fades it away to
 *            reveal all 15 rows from the demo Field Tracker spreadsheet.
 * Steps 8–10 cover feedback, language, and wrap-up.
 *
 * This tour is intended for Install Managers / Controls Managers — NOT admins.
 * It covers the core daily workflow: dashboard, creating projects, uploading the
 * Field Tracker, submitting feedback, and the language switcher.
 * Admin-only pages (Users / Invite) are intentionally excluded.
 */

export interface TourAutoInteract {
  /**
   * 'type'     — agent types `text` into the element (React-compatible input events).
   * 'click'    — agent clicks the element (fires real click, e.g. opens a modal).
   * 'dispatch' — dispatches a named CustomEvent on window (used for wizard simulation).
   */
  type: "type" | "click" | "dispatch";
  /** Text to type character-by-character (only used when type === 'type'). */
  text?: string;
  /** CustomEvent name to dispatch on window (only used when type === 'dispatch'). */
  eventName?: string;
  /**
   * How to clean up when the user advances to the next step.
   * 'clear'  — clear the input value back to ""
   * 'escape' — dispatch Escape keydown on document (closes modals, dropdowns)
   */
  cleanupOnLeave?: "clear" | "escape";
}

/** Bilingual string used for tour card text and voice narration. */
export type LocalizedString = { en: string; es: string };

export interface SiteTourStep {
  order: number;
  pageUrl: string;
  elementSelector: string;
  title: LocalizedString;
  description: LocalizedString;
  voiceText: LocalizedString;
  /** Optional agent interaction fired automatically after the cursor arrives. */
  autoInteract?: TourAutoInteract;
}

export const SITE_TOUR_STEPS: SiteTourStep[] = [
  {
    order: 1,
    pageUrl: "/",
    elementSelector: "#main-content",
    title: {
      en: "Welcome to CP Build Field Tracker",
      es: "Bienvenido al Field Tracker de CP Build",
    },
    description: {
      en: "This is your central hub for tracking every construction project, team member, and install phase — all in one place. Let me show you around.",
      es: "Este es tu centro de control para darle seguimiento a cada proyecto de construcción, fase de instalación y miembro del equipo — todo en un solo lugar. Déjame mostrarte.",
    },
    voiceText: {
      en: "Welcome to CP Build Field Tracker! I'm excited to give you a quick tour of everything you have at your fingertips. Let's get started.",
      es: "¡Bienvenido al Field Tracker de CP Build! Estoy emocionado de darte un recorrido rápido por todo lo que tienes al alcance de tu mano. Comencemos.",
    },
  },
  {
    order: 2,
    pageUrl: "/",
    elementSelector: "[data-tour='dashboard-stats']",
    title: {
      en: "Your Dashboard at a Glance",
      es: "Tu Panel de Control",
    },
    description: {
      en: "The dashboard shows a live summary of your active projects, pending items, and recent activity. It updates automatically as the team makes progress.",
      es: "El panel muestra un resumen en tiempo real de tus proyectos activos, elementos pendientes y actividad reciente. Se actualiza automáticamente conforme el equipo avanza.",
    },
    voiceText: {
      en: "Right here on the dashboard you can see a live snapshot of your active projects and where everything stands. It's the first thing you'll check each morning.",
      es: "Aquí en el panel puedes ver una instantánea en vivo de tus proyectos activos y en qué estado está todo. Es lo primero que revisarás cada mañana.",
    },
  },
  {
    order: 3,
    pageUrl: "/projects",
    elementSelector: "[data-tour='projects-table']",
    title: {
      en: "Project List",
      es: "Lista de Proyectos",
    },
    description: {
      en: "Every construction project lives here. You can see the status, site location, project manager, and key dates for each one at a glance.",
      es: "Todos los proyectos de construcción están aquí. Puedes ver el estatus, la ubicación, el gerente de proyecto y las fechas clave de cada uno de un vistazo.",
    },
    voiceText: {
      en: "This is the Projects page — your master list of every active and completed construction project. Each row shows you the status, location, and who's managing it.",
      es: "Esta es la página de Proyectos — tu lista maestra de cada proyecto de construcción activo y completado. Cada fila te muestra el estatus, la ubicación y quién lo gestiona.",
    },
  },
  {
    order: 4,
    pageUrl: "/projects",
    elementSelector: "[data-tour='projects-search']",
    title: {
      en: "Search and Filter",
      es: "Buscar y Filtrar",
    },
    description: {
      en: "Use the search bar to find any project by name or location. Filter by status — Active, Planning, On Hold, or Completed — to narrow things down fast.",
      es: "Usa la barra de búsqueda para encontrar cualquier proyecto por nombre o ubicación. Filtra por estatus — Activo, Planeación, En Espera o Completado — para encontrarlo rápido.",
    },
    voiceText: {
      en: "Need to find a specific project quickly? Just type in the search bar or use the status filter to narrow down the list. It's instant.",
      es: "¿Necesitas encontrar un proyecto rápidamente? Solo escribe en la barra de búsqueda o usa el filtro de estatus para reducir la lista. Es instantáneo.",
    },
    autoInteract: {
      type: "type",
      text: "Menchaca",
      cleanupOnLeave: "clear",
    },
  },
  {
    order: 5,
    pageUrl: "/projects",
    elementSelector: "[data-tour='add-project-button']",
    title: {
      en: "Adding a New Project",
      es: "Agregar un Nuevo Proyecto",
    },
    description: {
      en: "Click 'Add Project' to open the project creation wizard. You'll link a Unifier project, confirm the details, and your workspace is created instantly.",
      es: "Haz clic en 'Agregar Proyecto' para abrir el asistente. Conectarás un proyecto de Unifier, confirmarás los detalles y tu espacio de trabajo quedará creado al instante.",
    },
    voiceText: {
      en: "When a new project kicks off, just hit Add Project. A wizard opens where you connect it straight to Unifier. Watch — I'll run through it right now.",
      es: "Cuando comienza un proyecto, solo presiona Agregar Proyecto. Se abre un asistente donde lo conectas directamente a Unifier. Mira — te mostraré cómo funciona ahora mismo.",
    },
    // Clicks the button — modal opens, step 6 drives the wizard simulation.
    autoInteract: {
      type: "click",
    },
  },
  {
    order: 6,
    pageUrl: "/projects",
    elementSelector: "[data-tour='create-project-modal']",
    title: {
      en: "Creating Your Project",
      es: "Creando Tu Proyecto",
    },
    description: {
      en: "Watch the wizard at work — it's selecting a project from Unifier, pulling in all the details automatically, and creating the workspace. In real use, you'd confirm each step yourself.",
      es: "Observa el asistente en acción — está seleccionando un proyecto de Unifier, extrayendo todos los detalles automáticamente y creando el espacio de trabajo. En uso real, tú confirmarías cada paso.",
    },
    voiceText: {
      en: "Here's the full wizard in action. I'm selecting a project from Unifier, the details come through automatically — name, number, location, project manager — and then the workspace gets created. Easy.",
      es: "Aquí está el asistente completo en acción. Estoy seleccionando un proyecto de Unifier — los detalles llegan automáticamente, nombre, número, ubicación, gerente de proyecto — y luego se crea el espacio de trabajo. Muy fácil.",
    },
    // Dispatches tour:run-full-wizard-no-upm — CreateProjectModal selects a
    // random Unifier project, confirms details, and creates the project in
    // ~2 s with no Field Tracker attached yet. Modal closes automatically.
    // cleanupOnLeave: escape closes the modal if the user skips mid-animation.
    autoInteract: {
      type: "dispatch",
      eventName: "tour:run-full-wizard-no-upm",
      cleanupOnLeave: "escape",
    },
  },
  {
    order: 7,
    pageUrl: "/projects/{{PROJECT_ID}}/units",
    elementSelector: "[data-tour='field-tracker']",
    title: {
      en: "Upload the Field Tracker",
      es: "Cargar el Field Tracker",
    },
    description: {
      en: "Now we're inside the project. Watch as I upload the Field Tracker spreadsheet — 15 units across Buildings A, B, and C load in automatically as the system parses every row.",
      es: "Ahora estamos dentro del proyecto. Observa cómo cargo el Field Tracker — 15 unidades de los Edificios A, B y C se cargan automáticamente mientras el sistema analiza cada fila.",
    },
    voiceText: {
      en: "Now we're inside the project workspace. I'm simulating a Field Tracker upload right now — watch as the fifteen units stream in from the spreadsheet, organized by building and scope stage.",
      es: "Ahora estamos dentro del espacio de trabajo del proyecto. Estoy simulando una carga de Field Tracker ahora mismo — observa cómo las quince unidades se procesan desde la hoja de cálculo, organizadas por edificio y etapa de alcance.",
    },
    // Dispatches tour:simulate-field-tracker-upload — UnitsPageClient shows a
    // progress overlay (filename, progress bar) while units load, then fades
    // it away to reveal all 15 rows. event.detail.lang drives Spanish strings.
    autoInteract: {
      type: "dispatch",
      eventName: "tour:simulate-field-tracker-upload",
    },
  },
  {
    order: 8,
    pageUrl: "/",
    elementSelector: "[data-tour='notification-bell']",
    title: {
      en: "Feedback & Status Updates",
      es: "Retroalimentación y Actualizaciones",
    },
    description: {
      en: "See that feedback button at the bottom-right corner? Use it to report a bug, request a feature, or flag any issue. Your notifications here in the bell will update you when the team has responded.",
      es: "¿Ves ese botón de retroalimentación en la esquina inferior derecha? Úsalo para reportar un error, solicitar una función o señalar cualquier problema. Tus notificaciones aquí en la campana te avisarán cuando el equipo haya respondido.",
    },
    voiceText: {
      en: "One more important thing — the feedback button in the bottom-right corner lets you report bugs or request features at any time. Submit your report there and check back here in your notifications to see when someone responds.",
      es: "Una cosa más importante — el botón de retroalimentación en la esquina inferior derecha te permite reportar errores o solicitar funciones en cualquier momento. Envía tu reporte ahí y revisa aquí tus notificaciones para ver cuándo alguien responde.",
    },
  },
  {
    order: 9,
    pageUrl: "/",
    elementSelector: "[data-tour='locale-switcher']",
    title: {
      en: "Language Switcher",
      es: "Selector de Idioma",
    },
    description: {
      en: "Field Tracker is fully available in English and Spanish. Switch languages at any time using the EN / ES toggle in the top bar — your choice is remembered across sessions.",
      es: "El Field Tracker está completamente disponible en inglés y español. Cambia de idioma en cualquier momento usando el selector EN/ES en la barra superior — tu elección se recuerda entre sesiones.",
    },
    voiceText: {
      en: "The platform is fully bilingual — English and Spanish. Just tap the language switcher here to change at any time, and your preference is saved automatically.",
      es: "La plataforma es completamente bilingüe — inglés y español. Solo toca el selector de idioma aquí para cambiar en cualquier momento, y tu preferencia se guarda automáticamente.",
    },
  },
  {
    order: 10,
    pageUrl: "/",
    elementSelector: "#main-content",
    title: {
      en: "You're All Set!",
      es: "¡Todo Listo!",
    },
    description: {
      en: "That covers the essentials for your daily workflow. You can replay this tour anytime by clicking the Tour button in the top navigation bar. Welcome to the team — let's build something great.",
      es: "Eso cubre lo esencial de tu flujo de trabajo diario. Puedes repetir este recorrido en cualquier momento haciendo clic en el botón de Recorrido en la barra de navegación. Bienvenido al equipo — construyamos algo grandioso.",
    },
    voiceText: {
      en: "And that's it — you're ready to go! If you ever need a refresher, just click the Tour button in the top bar to play it again. Welcome to CP Build Field Tracker. Let's get to work!",
      es: "Y eso es todo — ¡estás listo para comenzar! Si alguna vez necesitas repasar, solo haz clic en el botón de Recorrido en la barra superior para reproducirlo de nuevo. Bienvenido al Field Tracker de CP Build. ¡A trabajar!",
    },
  },
];
