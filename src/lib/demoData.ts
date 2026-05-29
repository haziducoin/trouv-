import type { ProspectResult, ProspectSearchParams, ProspectSearchResponse } from './prospectApi'

// ─── Masquage coordonnées (mode démo) ────────────────────────────────────────
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length >= 10) {
    return `${digits.slice(0, 2)} •• •• •• ${digits.slice(-2)}`
  }
  return `${phone.slice(0, 3)}•••••${phone.slice(-2)}`
}

export function maskEmail(email: string): string {
  const atIdx = email.indexOf('@')
  if (atIdx < 1) return '•••@•••.fr'
  const local   = email.slice(0, atIdx)
  const domain  = email.slice(atIdx + 1)
  const lastDot = domain.lastIndexOf('.')
  const ext     = lastDot > 0 ? domain.slice(lastDot) : ''
  const domMain = lastDot > 0 ? domain.slice(0, lastDot) : domain
  return `${local[0]}•••@${domMain[0]}•••${ext}`
}

// ─── 30 contacts fictifs — 6 secteurs professionnels ─────────────────────────
export const DEMO_PROSPECTS: ProspectResult[] = [
  // ── BTP / Construction ───────────────────────────────────────────────────────
  { id: 'demo-001', firstName: 'Thomas', lastName: 'Berger', fullName: 'Thomas Berger',
    jobTitle: 'Directeur de travaux', companyName: 'Berger BTP',
    companySiren: '412000001', activityCode: '4120A', activityLabel: 'Construction de maisons individuelles',
    companySize: '10-19', companyType: 'SARL',
    email: 't.berger@berger-btp.fr', phone: '04 78 12 34 56', phoneMobile: '06 12 34 56 01',
    linkedinUrl: 'https://linkedin.com/in/thomas-berger-btp', website: 'https://berger-btp.fr',
    address: '12 Rue des Bâtisseurs', city: 'Lyon', zipCode: '69003', department: '69',
    region: 'Auvergne-Rhône-Alpes', isActive: true, createdAt: '2022-03-15T00:00:00Z' },

  { id: 'demo-002', firstName: 'Marie', lastName: 'Fontaine', fullName: 'Marie Fontaine',
    jobTitle: 'Conductrice de travaux', companyName: 'EIFFAGE Construction',
    companySiren: '412000002', activityCode: '4120A', activityLabel: 'Construction de maisons individuelles',
    companySize: '500-999', companyType: 'SAS',
    email: 'm.fontaine@eiffage.fr', phone: '01 42 56 78 90', phoneMobile: '07 23 45 67 02',
    linkedinUrl: null, website: null,
    address: '3 Av. de la Grande Armée', city: 'Paris', zipCode: '75017', department: '75',
    region: 'Île-de-France', isActive: true, createdAt: '2021-11-08T00:00:00Z' },

  { id: 'demo-003', firstName: 'Laurent', lastName: 'Dupuis', fullName: 'Laurent Dupuis',
    jobTitle: 'Chef de chantier', companyName: 'Guérin Travaux Publics',
    companySiren: '412000003', activityCode: '4120A', activityLabel: 'Construction de bâtiments',
    companySize: '3-5', companyType: 'Entrepreneur individuel',
    email: 'l.dupuis@guerin-tp.fr', phone: '04 91 23 45 67', phoneMobile: '06 34 56 78 03',
    linkedinUrl: null, website: null,
    address: '45 Rue du Port', city: 'Marseille', zipCode: '13002', department: '13',
    region: "Provence-Alpes-Côte d'Azur", isActive: true, createdAt: '2023-01-20T00:00:00Z' },

  { id: 'demo-004', firstName: 'Sophie', lastName: 'Renaud', fullName: 'Sophie Renaud',
    jobTitle: 'Responsable de projets', companyName: 'Renaud Promotion',
    companySiren: '412000004', activityCode: '4120A', activityLabel: 'Construction de maisons individuelles',
    companySize: '20-49', companyType: 'SAS',
    email: 's.renaud@renaud-promotion.fr', phone: '05 56 34 12 78', phoneMobile: '07 45 67 89 04',
    linkedinUrl: 'https://linkedin.com/in/sophie-renaud', website: null,
    address: "18 Cours de l'Intendance", city: 'Bordeaux', zipCode: '33000', department: '33',
    region: 'Nouvelle-Aquitaine', isActive: true, createdAt: '2022-07-03T00:00:00Z' },

  { id: 'demo-005', firstName: 'Antoine', lastName: 'Leblanc', fullName: 'Antoine Leblanc',
    jobTitle: 'Gérant', companyName: 'Leblanc Rénovation',
    companySiren: '412000005', activityCode: '4120A', activityLabel: 'Travaux de rénovation générale',
    companySize: '1-2', companyType: 'SARL',
    email: 'a.leblanc@leblanc-renov.fr', phone: '03 20 45 67 89', phoneMobile: '06 56 78 90 05',
    linkedinUrl: null, website: 'https://leblanc-renov.fr',
    address: '7 Rue du Commerce', city: 'Lille', zipCode: '59000', department: '59',
    region: 'Hauts-de-France', isActive: true, createdAt: '2023-05-12T00:00:00Z' },

  // ── Santé ────────────────────────────────────────────────────────────────────
  { id: 'demo-006', firstName: 'Claire', lastName: 'Marchand', fullName: 'Dr. Claire Marchand',
    jobTitle: 'Médecin généraliste', companyName: 'Cabinet Médical Marchand',
    companySiren: '869000001', activityCode: '8699C', activityLabel: 'Autres activités de soins',
    companySize: '1-2', companyType: 'Entrepreneur individuel',
    email: 'dr.marchand@cabinet-marchand.fr', phone: '05 61 23 45 67', phoneMobile: '06 67 89 01 06',
    linkedinUrl: null, website: null,
    address: '22 Rue des Carmes', city: 'Toulouse', zipCode: '31000', department: '31',
    region: 'Occitanie', isActive: true, createdAt: '2020-09-14T00:00:00Z' },

  { id: 'demo-007', firstName: 'François', lastName: 'Petit', fullName: 'François Petit',
    jobTitle: 'Directeur administratif', companyName: 'Clinique Saint-Joseph',
    companySiren: '869000002', activityCode: '8610Z', activityLabel: 'Activités hospitalières',
    companySize: '200-249', companyType: 'Association',
    email: 'f.petit@clinique-stjoseph.fr', phone: '02 40 12 34 56', phoneMobile: '07 78 90 12 07',
    linkedinUrl: 'https://linkedin.com/in/francois-petit', website: 'https://clinique-stjoseph.fr',
    address: '5 Rue de la Paix', city: 'Nantes', zipCode: '44000', department: '44',
    region: 'Pays de la Loire', isActive: true, createdAt: '2019-04-22T00:00:00Z' },

  { id: 'demo-008', firstName: 'Isabelle', lastName: 'Moreau', fullName: 'Isabelle Moreau',
    jobTitle: 'Infirmière coordinatrice', companyName: 'SSIAD Alsace Services',
    companySiren: '869000003', activityCode: '8699C', activityLabel: 'Soins infirmiers à domicile',
    companySize: '10-19', companyType: 'Association',
    email: 'i.moreau@ssiad-alsace.fr', phone: '03 88 45 67 89', phoneMobile: '06 89 01 23 08',
    linkedinUrl: null, website: null,
    address: '34 Rue du Marché', city: 'Strasbourg', zipCode: '67000', department: '67',
    region: 'Grand Est', isActive: true, createdAt: '2021-06-30T00:00:00Z' },

  { id: 'demo-009', firstName: 'Paul', lastName: 'Simon', fullName: 'Paul Simon',
    jobTitle: 'Pharmacien titulaire', companyName: 'Pharmacie Simon',
    companySiren: '869000004', activityCode: '4773Z', activityLabel: 'Commerce de produits pharmaceutiques',
    companySize: '3-5', companyType: 'SARL',
    email: 'paul.simon@pharmacie-simon.fr', phone: '01 45 67 89 01', phoneMobile: '07 90 12 34 09',
    linkedinUrl: null, website: null,
    address: '89 Rue de Rivoli', city: 'Paris', zipCode: '75004', department: '75',
    region: 'Île-de-France', isActive: true, createdAt: '2018-11-05T00:00:00Z' },

  { id: 'demo-010', firstName: 'Nathalie', lastName: 'Gauthier', fullName: 'Nathalie Gauthier',
    jobTitle: 'Directrice', companyName: 'EHPAD Les Tilleuls',
    companySiren: '869000005', activityCode: '8710A', activityLabel: 'Hébergement médicalisé personnes âgées',
    companySize: '50-99', companyType: 'Association',
    email: 'n.gauthier@ehpad-lestilleuls.fr', phone: '04 93 12 34 56', phoneMobile: '06 01 23 45 10',
    linkedinUrl: 'https://linkedin.com/in/nathalie-gauthier', website: 'https://ehpad-lestilleuls.fr',
    address: '15 Promenade des Anglais', city: 'Nice', zipCode: '06000', department: '06',
    region: "Provence-Alpes-Côte d'Azur", isActive: true, createdAt: '2017-02-18T00:00:00Z' },

  // ── Finance / Comptabilité ───────────────────────────────────────────────────
  { id: 'demo-011', firstName: 'Éric', lastName: 'Lambert', fullName: 'Éric Lambert',
    jobTitle: 'Expert-comptable', companyName: 'Lambert & Associés',
    companySiren: '692000001', activityCode: '6920Z', activityLabel: 'Activités comptables',
    companySize: '6-9', companyType: 'SAS',
    email: 'e.lambert@lambert-associes.fr', phone: '01 53 45 67 89', phoneMobile: '06 12 56 78 11',
    linkedinUrl: 'https://linkedin.com/in/eric-lambert-expert', website: 'https://lambert-associes.fr',
    address: '2 Rue du Louvre', city: 'Paris', zipCode: '75001', department: '75',
    region: 'Île-de-France', isActive: true, createdAt: '2016-09-01T00:00:00Z' },

  { id: 'demo-012', firstName: 'Valérie', lastName: 'Bonnet', fullName: 'Valérie Bonnet',
    jobTitle: 'Directrice financière', companyName: 'Bonnet Finance Consulting',
    companySiren: '692000002', activityCode: '6920Z', activityLabel: 'Conseil financier',
    companySize: '3-5', companyType: 'SARL',
    email: 'v.bonnet@bonnet-finance.fr', phone: '04 78 89 01 23', phoneMobile: '07 23 67 89 12',
    linkedinUrl: null, website: null,
    address: '78 Cours Vitton', city: 'Lyon', zipCode: '69006', department: '69',
    region: 'Auvergne-Rhône-Alpes', isActive: true, createdAt: '2020-01-15T00:00:00Z' },

  { id: 'demo-013', firstName: 'Marc', lastName: 'Rousseau', fullName: 'Marc Rousseau',
    jobTitle: 'Commissaire aux comptes', companyName: 'Rousseau Audit & Conseil',
    companySiren: '692000003', activityCode: '6920Z', activityLabel: 'Activités comptables',
    companySize: '6-9', companyType: 'SAS',
    email: 'm.rousseau@rousseau-audit.fr', phone: '05 57 12 34 56', phoneMobile: '06 34 78 90 13',
    linkedinUrl: 'https://linkedin.com/in/marc-rousseau-audit', website: 'https://rousseau-audit.fr',
    address: '14 Allées de Tourny', city: 'Bordeaux', zipCode: '33000', department: '33',
    region: 'Nouvelle-Aquitaine', isActive: true, createdAt: '2015-06-20T00:00:00Z' },

  { id: 'demo-014', firstName: 'Christine', lastName: 'Fournier', fullName: 'Christine Fournier',
    jobTitle: 'Responsable comptable', companyName: 'CFO Partners Nord',
    companySiren: '692000004', activityCode: '6920Z', activityLabel: 'Activités comptables',
    companySize: '10-19', companyType: 'SARL',
    email: 'c.fournier@cfo-partners.fr', phone: '03 20 23 45 67', phoneMobile: '07 45 89 01 14',
    linkedinUrl: null, website: null,
    address: '5 Rue Faidherbe', city: 'Lille', zipCode: '59000', department: '59',
    region: 'Hauts-de-France', isActive: true, createdAt: '2019-08-10T00:00:00Z' },

  { id: 'demo-015', firstName: 'Alexandre', lastName: 'Martin', fullName: 'Alexandre Martin',
    jobTitle: 'Gérant', companyName: 'AM Comptabilité',
    companySiren: '692000005', activityCode: '6920Z', activityLabel: 'Activités comptables',
    companySize: '1-2', companyType: 'Entrepreneur individuel',
    email: 'a.martin@am-compta.fr', phone: '04 91 56 78 90', phoneMobile: '06 56 90 12 15',
    linkedinUrl: null, website: null,
    address: '32 Rue de Rome', city: 'Marseille', zipCode: '13001', department: '13',
    region: "Provence-Alpes-Côte d'Azur", isActive: true, createdAt: '2021-03-25T00:00:00Z' },

  // ── RH / Recrutement ────────────────────────────────────────────────────────
  { id: 'demo-016', firstName: 'Sarah', lastName: 'Durand', fullName: 'Sarah Durand',
    jobTitle: 'Directrice des ressources humaines', companyName: 'Talent Solutions France',
    companySiren: '781000001', activityCode: '7810Z', activityLabel: 'Activités des agences de placement',
    companySize: '50-99', companyType: 'SAS',
    email: 's.durand@talentsolutions.fr', phone: '01 44 67 89 01', phoneMobile: '07 67 01 23 16',
    linkedinUrl: 'https://linkedin.com/in/sarah-durand-rh', website: 'https://talentsolutions.fr',
    address: '9 Rue de la Bourse', city: 'Paris', zipCode: '75002', department: '75',
    region: 'Île-de-France', isActive: true, createdAt: '2018-04-11T00:00:00Z' },

  { id: 'demo-017', firstName: 'Nicolas', lastName: 'Bernard', fullName: 'Nicolas Bernard',
    jobTitle: 'Consultant RH senior', companyName: 'Bernard Recrutement',
    companySiren: '781000002', activityCode: '7810Z', activityLabel: 'Placement de travailleurs',
    companySize: '3-5', companyType: 'SARL',
    email: 'n.bernard@bernard-recrutement.fr', phone: '04 72 34 56 78', phoneMobile: '06 78 12 34 17',
    linkedinUrl: 'https://linkedin.com/in/nicolas-bernard', website: null,
    address: '24 Rue de la République', city: 'Lyon', zipCode: '69002', department: '69',
    region: 'Auvergne-Rhône-Alpes', isActive: true, createdAt: '2020-10-05T00:00:00Z' },

  { id: 'demo-018', firstName: 'Laura', lastName: 'Leroy', fullName: 'Laura Leroy',
    jobTitle: 'Chargée de recrutement', companyName: 'Hays France – Nantes',
    companySiren: '781000003', activityCode: '7810Z', activityLabel: 'Activités des agences de placement',
    companySize: '100-199', companyType: 'SAS',
    email: 'l.leroy@hays.fr', phone: '02 53 45 67 89', phoneMobile: '07 89 23 45 18',
    linkedinUrl: null, website: null,
    address: '1 Place du Commerce', city: 'Nantes', zipCode: '44000', department: '44',
    region: 'Pays de la Loire', isActive: true, createdAt: '2022-02-14T00:00:00Z' },

  { id: 'demo-019', firstName: 'Pierre', lastName: 'Girard', fullName: 'Pierre Girard',
    jobTitle: 'Directeur des ressources humaines', companyName: 'Girard RH Consulting',
    companySiren: '781000004', activityCode: '7810Z', activityLabel: 'Conseil en ressources humaines',
    companySize: '6-9', companyType: 'SARL',
    email: 'p.girard@girard-rh.fr', phone: '05 62 12 34 56', phoneMobile: '06 90 34 56 19',
    linkedinUrl: 'https://linkedin.com/in/pierre-girard-rh', website: 'https://girard-rh.fr',
    address: '11 Bd de Strasbourg', city: 'Toulouse', zipCode: '31000', department: '31',
    region: 'Occitanie', isActive: true, createdAt: '2017-07-19T00:00:00Z' },

  { id: 'demo-020', firstName: 'Emma', lastName: 'Blanc', fullName: 'Emma Blanc',
    jobTitle: 'Recruteuse senior', companyName: 'Michael Page – Grand Est',
    companySiren: '781000005', activityCode: '7810Z', activityLabel: 'Activités des agences de placement',
    companySize: '200-249', companyType: 'SAS',
    email: 'e.blanc@michaelpage.fr', phone: '03 88 67 89 01', phoneMobile: '07 01 45 67 20',
    linkedinUrl: 'https://linkedin.com/in/emma-blanc', website: null,
    address: '4 Place Kléber', city: 'Strasbourg', zipCode: '67000', department: '67',
    region: 'Grand Est', isActive: true, createdAt: '2021-09-08T00:00:00Z' },

  // ── Commerce / Distribution ──────────────────────────────────────────────────
  { id: 'demo-021', firstName: 'Frédéric', lastName: 'Roux', fullName: 'Frédéric Roux',
    jobTitle: 'Directeur commercial', companyName: 'Roux Distribution Sud',
    companySiren: '471000001', activityCode: '4711B', activityLabel: 'Commerce alimentaire',
    companySize: '50-99', companyType: 'SAS',
    email: 'f.roux@roux-distribution.fr', phone: '04 91 78 90 12', phoneMobile: '06 23 67 89 21',
    linkedinUrl: null, website: null,
    address: '18 Rue de la Canebière', city: 'Marseille', zipCode: '13001', department: '13',
    region: "Provence-Alpes-Côte d'Azur", isActive: true, createdAt: '2016-05-30T00:00:00Z' },

  { id: 'demo-022', firstName: 'Aurélie', lastName: 'Fabre', fullName: 'Aurélie Fabre',
    jobTitle: 'Responsable des ventes', companyName: 'Fabre & Co Négoce',
    companySiren: '471000002', activityCode: '4711B', activityLabel: 'Commerce de détail',
    companySize: '10-19', companyType: 'SARL',
    email: 'a.fabre@fabre-co.fr', phone: '01 47 23 45 67', phoneMobile: '07 34 78 90 22',
    linkedinUrl: 'https://linkedin.com/in/aurelie-fabre', website: 'https://fabre-co.fr',
    address: '33 Rue du Faubourg Saint-Antoine', city: 'Paris', zipCode: '75011', department: '75',
    region: 'Île-de-France', isActive: true, createdAt: '2019-12-01T00:00:00Z' },

  { id: 'demo-023', firstName: 'Julien', lastName: 'Mathieu', fullName: 'Julien Mathieu',
    jobTitle: 'Chef de secteur', companyName: 'Mathieu Distribution Atlantique',
    companySiren: '471000003', activityCode: '4711B', activityLabel: 'Grande distribution alimentaire',
    companySize: '100-199', companyType: 'SAS',
    email: 'j.mathieu@mathieu-distrib.fr', phone: '05 56 89 01 23', phoneMobile: '06 45 89 01 23',
    linkedinUrl: null, website: null,
    address: '6 Cours du Chapeau Rouge', city: 'Bordeaux', zipCode: '33000', department: '33',
    region: 'Nouvelle-Aquitaine', isActive: true, createdAt: '2020-08-17T00:00:00Z' },

  { id: 'demo-024', firstName: 'Caroline', lastName: 'Henry', fullName: 'Caroline Henry',
    jobTitle: 'Directrice de magasin', companyName: 'Carrefour City – Vieux-Lille',
    companySiren: '471000004', activityCode: '4711B', activityLabel: 'Grande distribution alimentaire',
    companySize: '20-49', companyType: 'SAS',
    email: 'c.henry@carrefour.fr', phone: '03 20 56 78 90', phoneMobile: '07 56 90 12 24',
    linkedinUrl: null, website: null,
    address: '10 Rue Nationale', city: 'Lille', zipCode: '59800', department: '59',
    region: 'Hauts-de-France', isActive: true, createdAt: '2023-03-08T00:00:00Z' },

  { id: 'demo-025', firstName: 'Bruno', lastName: 'Lefèvre', fullName: 'Bruno Lefèvre',
    jobTitle: 'Responsable achats', companyName: 'Lefèvre Import Export',
    companySiren: '471000005', activityCode: '4711B', activityLabel: 'Commerce de gros',
    companySize: '20-49', companyType: 'SAS',
    email: 'b.lefevre@lefevre-import.fr', phone: '04 72 67 89 01', phoneMobile: '06 67 01 23 25',
    linkedinUrl: 'https://linkedin.com/in/bruno-lefevre', website: 'https://lefevre-import.fr',
    address: '55 Avenue Berthelot', city: 'Lyon', zipCode: '69007', department: '69',
    region: 'Auvergne-Rhône-Alpes', isActive: true, createdAt: '2018-06-14T00:00:00Z' },

  // ── IT / Consulting ──────────────────────────────────────────────────────────
  { id: 'demo-026', firstName: 'Kevin', lastName: 'Nguyen', fullName: 'Kevin Nguyen',
    jobTitle: 'Développeur senior', companyName: 'NexTech Solutions',
    companySiren: '620000001', activityCode: '6201Z', activityLabel: 'Programmation informatique',
    companySize: '20-49', companyType: 'SAS',
    email: 'k.nguyen@nextech.fr', phone: '01 48 34 56 78', phoneMobile: '07 78 12 34 26',
    linkedinUrl: 'https://linkedin.com/in/kevin-nguyen-dev', website: 'https://nextech.fr',
    address: '42 Rue du Bac', city: 'Paris', zipCode: '75007', department: '75',
    region: 'Île-de-France', isActive: true, createdAt: '2021-05-20T00:00:00Z' },

  { id: 'demo-027', firstName: 'Amélie', lastName: 'Caron', fullName: 'Amélie Caron',
    jobTitle: 'CTO', companyName: 'Caron Digital Agency',
    companySiren: '620000002', activityCode: '6201Z', activityLabel: 'Programmation informatique',
    companySize: '10-19', companyType: 'SAS',
    email: 'a.caron@caron-digital.fr', phone: '04 37 12 34 56', phoneMobile: '06 89 23 45 27',
    linkedinUrl: 'https://linkedin.com/in/amelie-caron-cto', website: 'https://caron-digital.fr',
    address: '8 Place Bellecour', city: 'Lyon', zipCode: '69002', department: '69',
    region: 'Auvergne-Rhône-Alpes', isActive: true, createdAt: '2020-04-09T00:00:00Z' },

  { id: 'demo-028', firstName: 'Maxime', lastName: 'Perrin', fullName: 'Maxime Perrin',
    jobTitle: 'Chef de projet IT', companyName: 'Perrin Tech & Conseil',
    companySiren: '620000003', activityCode: '6201Z', activityLabel: 'Conseil en systèmes informatiques',
    companySize: '6-9', companyType: 'SARL',
    email: 'm.perrin@perrin-tech.fr', phone: '02 40 78 90 12', phoneMobile: '07 90 34 56 28',
    linkedinUrl: null, website: 'https://perrin-tech.fr',
    address: '16 Rue Crébillon', city: 'Nantes', zipCode: '44000', department: '44',
    region: 'Pays de la Loire', isActive: true, createdAt: '2022-09-27T00:00:00Z' },

  { id: 'demo-029', firstName: 'Lucie', lastName: 'Mercier', fullName: 'Lucie Mercier',
    jobTitle: 'Data Scientist', companyName: 'Mercier Analytics',
    companySiren: '620000004', activityCode: '6201Z', activityLabel: 'Traitement de données',
    companySize: '3-5', companyType: 'SAS',
    email: 'l.mercier@mercier-analytics.fr', phone: '05 56 01 23 45', phoneMobile: '06 01 45 67 29',
    linkedinUrl: 'https://linkedin.com/in/lucie-mercier-data', website: null,
    address: '27 Rue Sainte-Catherine', city: 'Bordeaux', zipCode: '33000', department: '33',
    region: 'Nouvelle-Aquitaine', isActive: true, createdAt: '2023-01-05T00:00:00Z' },

  { id: 'demo-030', firstName: 'Charles', lastName: 'Vasseur', fullName: 'Charles Vasseur',
    jobTitle: 'Directeur technique', companyName: 'Vasseur Systems',
    companySiren: '620000005', activityCode: '6201Z', activityLabel: 'Programmation informatique',
    companySize: '10-19', companyType: 'SAS',
    email: 'c.vasseur@vasseur-systems.fr', phone: '05 61 89 01 23', phoneMobile: '07 12 56 78 30',
    linkedinUrl: 'https://linkedin.com/in/charles-vasseur', website: 'https://vasseur-systems.fr',
    address: '3 Rue Alsace-Lorraine', city: 'Toulouse', zipCode: '31000', department: '31',
    region: 'Occitanie', isActive: true, createdAt: '2019-11-30T00:00:00Z' },
]

// ─── Recherche locale sur données démo ───────────────────────────────────────
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function searchDemoProspects(params: ProspectSearchParams): ProspectSearchResponse {
  const pg = params.page    ?? 1
  const pp = params.perPage ?? 20
  const q  = normalize(params.query ?? '')

  let filtered = DEMO_PROSPECTS.filter(p => {
    if (params.department  && p.department  !== params.department)  return false
    if (params.activityCode && p.activityCode !== params.activityCode) return false
    if (q) {
      const hay = normalize(
        [p.fullName, p.jobTitle, p.companyName, p.city, p.activityLabel, p.department]
          .filter(Boolean).join(' ')
      )
      if (!hay.includes(q)) return false
    }
    return true
  })

  // Toujours afficher des résultats pour l'expérience démo
  if (filtered.length === 0) filtered = [...DEMO_PROSPECTS]

  const total   = filtered.length
  const results = filtered.slice((pg - 1) * pp, pg * pp)

  return { results, total, page: pg, perPage: pp, totalPages: Math.ceil(total / pp) }
}
