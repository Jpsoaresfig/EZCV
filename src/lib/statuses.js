'use strict';

const STATUSES = {
  nuevo:       { label: 'Nuevo',       color: 'blue' },
  revisado:    { label: 'Revisado',    color: 'slate' },
  contactar:   { label: 'Contactar',   color: 'amber' },
  contactado:  { label: 'Contactado',  color: 'cyan' },
  entrevista:  { label: 'Entrevista',  color: 'violet' },
  contratado:  { label: 'Contratado',  color: 'green' },
  rechazado:   { label: 'Rechazado',   color: 'red' },
  reserva:     { label: 'Reserva / Futuras oportunidades', color: 'orange' }
};

const STATUS_KEYS = Object.keys(STATUSES);

const AVAILABILITIES = {
  '':            'Sin especificar',
  manana:        'Mañana',
  tarde:         'Tarde',
  flexible:      'Flexible / turnos rotativos',
  fin_semana:    'Fines de semana',
  jornada_comp:  'Jornada completa',
  jornada_part:  'Jornada parcial'
};

const DOC_TYPES = {
  nie:    'NIE',
  dni:    'DNI',
  pasaporte: 'Pasaporte',
  otro:   'Otro documento'
};

const ESTABLISHMENT_TYPES = {
  restaurante:   'Restaurante',
  bar:           'Bar',
  cafeteria:     'Cafetería',
  panaderia:     'Panadería / pastelería',
  food_truck:    'Food truck',
  tienda:        'Tienda de alimentación',
  otro:          'Otro'
};

const CONTRACT_TYPES = {
  '':           'Sin especificar',
  indefinido:   'Indefinido',
  eventual:     'Eventual / temporal',
  practicas:    'Prácticas',
  obra:         'Por obra o servicio',
  autonomo:     'Autónomo / freelance'
};

const WORK_SCHEDULES = {
  '':           'Sin especificar',
  completa:     'Jornada completa',
  parcial:      'Jornada parcial',
  turnos:       'Turnos rotativos',
  fines:        'Fines de semana',
  noches:       'Noches'
};

/* O texto e a versão do consentimento vivem em lib/consent.js, junto com os
 * textos que o candidato lê — para não haver duas fontes de verdade. */

const HISTORY_EVENTS = {
  recibida:    'Candidatura recibida',
  estado:      'Estado cambiado',
  favorito:    'Favorito actualizado'
};

function statusLabel(key) {
  return (STATUSES[key] && STATUSES[key].label) || key;
}

function availabilityLabel(key) {
  return AVAILABILITIES[key] || key || '';
}

function docTypeLabel(key) {
  return DOC_TYPES[key] || key || '';
}

function historyLabel(key) {
  return HISTORY_EVENTS[key] || key;
}

module.exports = {
  STATUSES, STATUS_KEYS, AVAILABILITIES, DOC_TYPES,
  ESTABLISHMENT_TYPES, CONTRACT_TYPES, WORK_SCHEDULES,
  HISTORY_EVENTS,
  statusLabel, availabilityLabel, docTypeLabel, historyLabel
};
