'use strict';

/* Texto da página de apresentação (/conoce), em espanhol e inglês.
 *
 * É a página para onde aponta o QR dos cartões que o admin entrega aos
 * estabelecimentos (Admin → Divulgación). Quem a abre não conhece o produto:
 * cada secção responde a uma pergunta, pela ordem em que a pessoa a faz.
 *
 * Regra: só descrever o que o produto faz hoje. Sem IA, sem matching, sem
 * publicação em portais de emprego, sem agendamento de entrevistas, sem
 * mensagens automáticas. «Entrevista» é um estado da candidatura, não uma
 * agenda. Ao acrescentar uma frase aqui, confirmar primeiro no painel.
 */

const LANGS = ['es', 'en'];

/* ?lang= explícito ganha; senão a primeira língua do browser. Por omissão
 * espanhol: os cartões são entregues em Espanha. */
function pickLang(req) {
  const q = String(req.query.lang || '').toLowerCase();
  if (LANGS.includes(q)) return q;
  const first = String(req.headers['accept-language'] || '').split(',')[0].trim().toLowerCase();
  return first.startsWith('en') ? 'en' : 'es';
}

const es = {
  htmlLang: 'es',
  title: 'Contratar personal puede ser más sencillo',
  description: 'Fíchame te ayuda a organizar tus contrataciones y seguir a tus candidatos en un solo lugar, aunque no tengas departamento de RR. HH. Gratis durante la prueba de mercado.',
  nav: { login: 'Entrar', start: 'Probar gratis', langLabel: 'Idioma' },

  hero: {
    badge: 'Prueba de mercado · Gratis',
    title: 'Contratar personal puede ser',
    titleHl: 'más sencillo.',
    lead: 'Fíchame es una web para organizar tus contrataciones: recibes a los candidatos, ves sus datos y su CV, y sigues a cada uno hasta elegir a la persona adecuada. Sin necesidad de un departamento de Recursos Humanos.',
    cta: 'Conocer Fíchame',
    cta2: 'Ver cómo funciona',
    note: ''
  },

  quick: {
    title: 'En pocas palabras',
    items: [
      { q: '¿Qué es?', a: 'Una web para organizar a tus candidatos y tus contrataciones.' },
      { q: '¿Necesito RR. HH.?', a: 'No. Lo puedes llevar tú mismo, desde el móvil.' },
      { q: '¿Hay que instalar algo?', a: 'No. Funciona en el navegador.' },
      { q: '¿Cuánto cuesta?', a: '0 €. Es gratis durante la prueba de mercado.' }
    ]
  },

  problem: {
    kicker: 'El problema',
    title: '¿De verdad tienes que hacerlo todo tú solo?',
    items: [
      { emoji: '📄', text: 'Recibir currículums' },
      { emoji: '📱', text: 'Contestar mensajes' },
      { emoji: '🗂️', text: 'Ordenar candidatos' },
      { emoji: '📞', text: 'Llamar y quedar para entrevistas' },
      { emoji: '📝', text: 'Tomar notas' },
      { emoji: '⏳', text: 'Recordar en qué punto está cada uno' }
    ],
    scatter: 'Y todo repartido entre papeles, WhatsApp, emails, hojas de cálculo… y tu memoria.',
    pain: 'Cuando no tienes un equipo de Recursos Humanos, la contratación acaba en tus manos.',
    answer: 'Fíchame organiza ese proceso por ti, en un solo lugar.'
  },

  what: {
    kicker: '¿Qué es Fíchame?',
    title: 'Tus contrataciones, ordenadas en un solo sitio.',
    p1: 'Fíchame es una plataforma de reclutamiento pensada para que negocios y pequeños establecimientos organicen sus contrataciones.',
    p2: 'En lugar de llevar a los candidatos en papeles, mensajes y hojas de cálculo sueltas, lo sigues todo dentro de la plataforma.',
    highlight: 'Puedes gestionar a tus candidatos tú mismo. No hace falta tener un equipo de Recursos Humanos para empezar.',
    for: 'Para restaurantes, bares, cafeterías, tiendas, comercios y cualquier negocio que necesite contratar.',
    biz: ['Restaurantes', 'Bares', 'Cafeterías', 'Tiendas', 'Comercios', 'Hoteles', 'Peluquerías', 'Gimnasios', '…y más']
  },

  can: {
    kicker: 'Qué puedes hacer',
    title: 'Todo lo que necesitas para contratar, sin complicaciones.',
    items: [
      {
        icon: 'jobs',
        title: 'Crear vacantes',
        text: 'Cuando necesitas a alguien, creas la vacante con el tipo de contrato, la jornada y los requisitos.',
        chips: ['Camarero/a', 'Dependiente/a', 'Cocinero/a', 'Recepcionista']
      },
      {
        icon: 'people',
        title: 'Recibir candidatos',
        text: 'Tu negocio tiene su propio enlace. Quien quiera trabajar contigo lo abre desde el móvil, elige la vacante y envía sus datos y su CV en PDF, sin crear ninguna cuenta.'
      },
      {
        icon: 'file',
        title: 'Ver a tus candidatos',
        text: 'Cada candidato tiene su ficha: contacto, disponibilidad, experiencia y CV. Sin buscar en mensajes ni en papeles.'
      },
      {
        icon: 'chart',
        title: 'Organizar el proceso',
        text: 'Marca en qué etapa está cada persona y sabrás siempre a quién llamar, a quién entrevistar y a quién guardar para más adelante.',
        pipeline: ['Nuevo', 'Revisado', 'Contactar', 'Entrevista', 'Contratado']
      },
      {
        icon: 'search',
        title: 'Gestionarlo todo en un solo lugar',
        text: 'Busca y filtra, marca favoritos, apunta notas internas y llama, escribe un email o abre WhatsApp desde la ficha.'
      }
    ],
    share: {
      title: '¿Cómo llegan los candidatos?',
      text: 'A través del enlace de tu negocio. Puedes ponerlo en tu local con una etiqueta NFC o con el código QR que Fíchame te prepara para imprimir, o compartirlo por WhatsApp y redes sociales.',
      note: 'Fíchame no publica tus vacantes en portales de empleo: tú decides dónde compartes tu enlace.'
    }
  },

  nohr: {
    kicker: 'Sin RR. HH.',
    title: '¿No tienes equipo de Recursos Humanos? No pasa nada.',
    lead: 'Fíchame está pensado también para negocios en los que el propio dueño o encargado se ocupa de contratar.',
    start: 'Sin departamento de RR. HH.',
    steps: [
      'Tú creas la vacante',
      'Recibes a los candidatos',
      'Revisas su información',
      'Los organizas por etapas',
      'Eliges quién sigue adelante'
    ],
    end: 'Lo puedes hacer tú solo.'
  },

  how: {
    kicker: 'Cómo funciona',
    title: '¿Cómo funciona?',
    lead: 'Seis pasos, del «necesito a alguien» al «ya tengo a la persona».',
    steps: [
      { title: 'Necesitas contratar', text: 'Te das cuenta de que te hace falta una persona más en tu negocio.' },
      { title: 'Creas la vacante en Fíchame', text: 'Indicas qué puesto buscas, el tipo de contrato, la jornada y los requisitos.' },
      { title: 'Los candidatos se apuntan', text: 'Quien está interesado abre tu enlace, elige la vacante y envía sus datos y su CV.' },
      { title: 'Sigues a tus candidatos', text: 'Todas las candidaturas llegan ordenadas a tu panel. Te avisamos cuando entra una nueva.' },
      { title: 'Valoras y organizas', text: 'Lees el CV, apuntas notas y mueves a cada persona de etapa: revisado, contactar, entrevista…' },
      { title: 'Encuentras a la persona adecuada', text: 'Con toda la información a mano, decides tú quién sigue adelante. Sin filtros automáticos.' }
    ]
  },

  video: {
    kicker: 'Fíchame en la práctica',
    title: 'Mira Fíchame funcionando.',
    lead: 'En pocos minutos verás cómo organizar tu proceso de contratación, con la aplicación real.',
    play: 'Ver el vídeo',
    soon: 'Vídeo en preparación',
    soonText: 'Muy pronto podrás ver aquí una grabación de la aplicación paso a paso.',
    chapters: [
      'Entrar en la plataforma',
      'Crear una vacante',
      'Recibir candidaturas',
      'Ver a los candidatos',
      'Organizar el proceso'
    ],
    unsupported: 'Tu navegador no puede reproducir este vídeo.'
  },

  benefits: {
    kicker: 'Ventajas',
    title: '¿Por qué usar Fíchame?',
    items: [
      { icon: 'home', title: 'Todo en un solo lugar', text: 'La información de tus candidatos, ordenada en una única plataforma.' },
      { icon: 'file', title: 'Menos papel', text: 'Menos currículums impresos y documentos que se pierden.' },
      { icon: 'chart', title: 'Más orden', text: 'Sabes quién es cada candidato y en qué etapa está.' },
      { icon: 'phone', title: 'Más práctico', text: 'Sin saltar entre varias herramientas para seguir una contratación.' },
      { icon: 'star', title: 'Tú tienes el control', text: 'El dueño o el encargado sigue el proceso directamente.' },
      { icon: 'store', title: 'Sin equipo de RR. HH.', text: 'Una forma sencilla de organizar la contratación sin crear un departamento.' }
    ]
  },

  free: {
    kicker: 'Precio',
    title: 'Fíchame está en fase de prueba de mercado.',
    p1: 'Ahora mismo estamos probando Fíchame con negocios reales para entender cómo puede ayudar en el día a día.',
    p2: 'Por eso, durante esta fase, puedes usar la plataforma gratis.',
    price: '0 €',
    priceLabel: 'Gratis durante la prueba de mercado',
    items: ['Sin cuota mensual', 'Sin tarjeta de crédito', 'Sin compromiso de permanencia'],
    fine: 'No te pedimos ningún dato de pago, así que no hay nada que se pueda cobrar automáticamente.'
  },

  feedback: {
    kicker: 'Tu opinión cuenta',
    title: 'Ayúdanos a mejorar Fíchame.',
    text: 'Estamos construyendo Fíchame a partir de las necesidades reales de quien contrata. Al probarlo y contarnos tu opinión, nos ayudas a entender qué funciona y qué se puede mejorar.',
    cta: 'Probar Fíchame',
    mail: 'Escríbenos'
  },

  faq: {
    kicker: 'Dudas frecuentes',
    title: 'Lo que suelen preguntarnos',
    items: [
      { q: '¿Es difícil de usar?', a: 'No. Está pensado para usarse desde el móvil, entre cliente y cliente. Crear la cuenta y la primera vacante lleva pocos minutos, y el panel te guía con unos primeros pasos.' },
      { q: '¿Tengo que instalar algo?', a: 'No. Ni tú ni los candidatos tenéis que instalar ninguna aplicación: todo funciona en el navegador del móvil o del ordenador.' },
      { q: '¿Necesito una etiqueta NFC?', a: 'No es obligatorio. Puedes imprimir el código QR que te prepara el panel o simplemente compartir el enlace de tu negocio.' },
      { q: '¿Y si ya no necesito contratar?', a: 'Pausas las candidaturas con un botón. Tu página mostrará que no estás contratando y podrás reactivarla cuando quieras.' },
      { q: '¿Quién ve los CV de mis candidatos?', a: 'Solo tú, desde tu panel. Los CV no tienen enlaces públicos y ningún otro negocio puede ver tus candidaturas.' }
    ]
  },

  final: {
    title: '¿Quieres probarlo?',
    lead: 'Conoce Fíchame y comprueba lo sencillo que puede ser organizar tus contrataciones.',
    cta: 'Probar gratis',
    login: 'Ya tengo cuenta',
    note: 'Gratis durante la fase de prueba de mercado.'
  }
};

const en = {
  htmlLang: 'en',
  title: 'Hiring staff can be simpler',
  description: 'Fíchame helps you organise your hiring and keep track of candidates in one place, even without an HR department. Free during the market test.',
  nav: { login: 'Log in', start: 'Try it free', langLabel: 'Language' },

  hero: {
    badge: 'Market test · Free',
    title: 'Hiring staff can be',
    titleHl: 'simpler.',
    lead: 'Fíchame is a web app to organise your hiring: you receive candidates, see their details and CV, and follow each one until you find the right person. No HR department needed.',
    cta: 'Discover Fíchame',
    cta2: 'See how it works',
    note: 'The app is currently in Spanish.'
  },

  quick: {
    title: 'In a nutshell',
    items: [
      { q: 'What is it?', a: 'A web app to organise your candidates and your hiring.' },
      { q: 'Do I need HR?', a: 'No. You can run it yourself, from your phone.' },
      { q: 'Do I need to install anything?', a: 'No. It works in the browser.' },
      { q: 'How much does it cost?', a: '€0. It is free during the market test.' }
    ]
  },

  problem: {
    kicker: 'The problem',
    title: 'Do you really have to do all of this on your own?',
    items: [
      { emoji: '📄', text: 'Collecting CVs' },
      { emoji: '📱', text: 'Answering messages' },
      { emoji: '🗂️', text: 'Sorting candidates' },
      { emoji: '📞', text: 'Calling and arranging interviews' },
      { emoji: '📝', text: 'Taking notes' },
      { emoji: '⏳', text: 'Remembering where everyone is' }
    ],
    scatter: 'And all of it spread across paper, WhatsApp, emails, spreadsheets… and your memory.',
    pain: 'When you don’t have an HR team, hiring ends up on your plate.',
    answer: 'Fíchame organises that process for you, in one place.'
  },

  what: {
    kicker: 'What is Fíchame?',
    title: 'Your hiring, organised in one place.',
    p1: 'Fíchame is a recruitment platform built to help businesses and small venues organise their hiring.',
    p2: 'Instead of tracking candidates across loose papers, messages and spreadsheets, you follow everything inside the platform.',
    highlight: 'You can manage your candidates yourself. You don’t need an HR team to get started.',
    for: 'For restaurants, bars, cafés, shops and any business that needs to hire.',
    biz: ['Restaurants', 'Bars', 'Cafés', 'Shops', 'Retail', 'Hotels', 'Hair salons', 'Gyms', '…and more']
  },

  can: {
    kicker: 'What you can do',
    title: 'Everything you need to hire, without the hassle.',
    items: [
      {
        icon: 'jobs',
        title: 'Create job openings',
        text: 'When you need someone, you create the opening with the contract type, hours and requirements.',
        chips: ['Waiter', 'Shop assistant', 'Cook', 'Receptionist']
      },
      {
        icon: 'people',
        title: 'Receive candidates',
        text: 'Your business has its own link. Anyone who wants to work with you opens it on their phone, picks the opening and sends their details and CV as a PDF, without creating an account.'
      },
      {
        icon: 'file',
        title: 'See your candidates',
        text: 'Each candidate has a profile: contact details, availability, experience and CV. No digging through messages or paper.'
      },
      {
        icon: 'chart',
        title: 'Organise the process',
        text: 'Mark which stage each person is at, so you always know who to call, who to interview and who to keep for later.',
        pipeline: ['New', 'Reviewed', 'To contact', 'Interview', 'Hired']
      },
      {
        icon: 'search',
        title: 'Manage it all in one place',
        text: 'Search and filter, star favourites, keep private notes, and call, email or open WhatsApp straight from the profile.'
      }
    ],
    share: {
      title: 'How do candidates reach you?',
      text: 'Through your business link. You can put it in your venue with an NFC tag or with the printable QR code Fíchame prepares for you, or share it on WhatsApp and social media.',
      note: 'Fíchame does not post your openings on job boards: you decide where to share your link.'
    }
  },

  nohr: {
    kicker: 'No HR',
    title: 'No HR team? No problem.',
    lead: 'Fíchame is also designed for businesses where the owner or manager does the hiring.',
    start: 'No HR department',
    steps: [
      'You create the opening',
      'You receive candidates',
      'You review their details',
      'You organise them by stage',
      'You choose who moves forward'
    ],
    end: 'You can do it on your own.'
  },

  how: {
    kicker: 'How it works',
    title: 'How does it work?',
    lead: 'Six steps, from “I need someone” to “I’ve found the right person”.',
    steps: [
      { title: 'You need to hire', text: 'You realise your business needs one more person.' },
      { title: 'You create the opening in Fíchame', text: 'You say which role you’re looking for, the contract type, hours and requirements.' },
      { title: 'Candidates apply', text: 'Interested people open your link, pick the opening and send their details and CV.' },
      { title: 'You follow your candidates', text: 'Every application lands in your dashboard, in order. We let you know when a new one arrives.' },
      { title: 'You review and organise', text: 'You read the CV, add notes and move each person through the stages: reviewed, to contact, interview…' },
      { title: 'You find the right person', text: 'With all the information at hand, you decide who moves forward. No automatic filters.' }
    ]
  },

  video: {
    kicker: 'Fíchame in practice',
    title: 'See Fíchame in action.',
    lead: 'In a few minutes you’ll see how to organise your hiring process, using the real app.',
    play: 'Play the video',
    soon: 'Video coming soon',
    soonText: 'You’ll soon be able to watch a step-by-step recording of the app here.',
    chapters: [
      'Logging in',
      'Creating an opening',
      'Receiving applications',
      'Viewing candidates',
      'Organising the process'
    ],
    unsupported: 'Your browser cannot play this video.'
  },

  benefits: {
    kicker: 'Benefits',
    title: 'Why use Fíchame?',
    items: [
      { icon: 'home', title: 'All in one place', text: 'Your candidates’ information, organised in a single platform.' },
      { icon: 'file', title: 'Less paper', text: 'Fewer printed CVs and documents that get lost.' },
      { icon: 'chart', title: 'More organised', text: 'You know who each candidate is and which stage they’re at.' },
      { icon: 'phone', title: 'More practical', text: 'No jumping between different tools to follow a hire.' },
      { icon: 'star', title: 'You’re in control', text: 'The owner or manager follows the process directly.' },
      { icon: 'store', title: 'No HR team needed', text: 'A simple way to organise hiring without building a department.' }
    ]
  },

  free: {
    kicker: 'Price',
    title: 'Fíchame is in its market test phase.',
    p1: 'Right now we are testing Fíchame with real businesses to understand how it can help day to day.',
    p2: 'That’s why, during this phase, you can use the platform for free.',
    price: '€0',
    priceLabel: 'Free during the market test',
    items: ['No monthly fee', 'No credit card', 'No commitment'],
    fine: 'We don’t ask for any payment details, so there is nothing that could be charged automatically.'
  },

  feedback: {
    kicker: 'Your opinion matters',
    title: 'Help us improve Fíchame.',
    text: 'We are building Fíchame around the real needs of people who hire. By trying it and telling us what you think, you help us understand what works and what could be better.',
    cta: 'Try Fíchame',
    mail: 'Email us'
  },

  faq: {
    kicker: 'Common questions',
    title: 'What people usually ask us',
    items: [
      { q: 'Is it hard to use?', a: 'No. It’s designed to be used on your phone, between customers. Creating your account and first opening takes a few minutes, and the dashboard guides you through the first steps.' },
      { q: 'Do I have to install anything?', a: 'No. Neither you nor your candidates need to install an app: everything works in the browser, on a phone or a computer.' },
      { q: 'Do I need an NFC tag?', a: 'No. You can print the QR code the dashboard prepares for you, or simply share your business link.' },
      { q: 'What if I stop hiring?', a: 'Pause applications with one button. Your page will show you’re not hiring, and you can switch it back on whenever you like.' },
      { q: 'Who can see my candidates’ CVs?', a: 'Only you, from your dashboard. CVs have no public links and no other business can see your applications.' }
    ]
  },

  final: {
    title: 'Want to try it?',
    lead: 'Discover Fíchame and see how simple organising your hiring can be.',
    cta: 'Try it free',
    login: 'I already have an account',
    note: 'Free during the market test phase. The app is currently in Spanish.'
  }
};

const COPY = { es, en };

module.exports = { LANGS, pickLang, COPY };
