# Base distante trouvé!

Le site est prepare pour une base externe Supabase/Postgres. Supabase fournit :

- un tableau de bord externe pour consulter les tables et les journaux ;
- l'authentification email/mot de passe ;
- les politiques Row Level Security (RLS) qui isolent les donnees selon les roles ;
- une base Postgres exportable et administrable.

## Donnees stockees

| Table | Usage |
| --- | --- |
| `organizations` | Societes verifiees et SIREN |
| `profiles` | Utilisateurs nominatifs, roles et statut d'acces |
| `access_requests` | Demandes et decisions de validation |
| `plans`, `subscriptions` | Offres et abonnements agence |
| `monthly_usage`, `searches` | Quotas et historique de recherches |
| `favorites` | Favoris personnels |
| `audit_logs` | Journal des connexions, validations, recherches et favoris |
| `privacy_requests` | Opposition, suppression, acces ou correction |
| `agency_invitations` | Invitations d'agents par une agence |

## Activation

1. Creer un projet sur [Supabase](https://supabase.com/dashboard/projects) ou connecter
   l'integration Supabase depuis Vercel.
2. Installer la CLI Supabase, puis lier ce dossier au projet :

```bash
npx supabase login
npx supabase link --project-ref VOTRE_PROJECT_REF
npx supabase db push
```

La migration appliquee est
`supabase/migrations/202605270001_initial_trouve_platform.sql`.

3. En local, ajouter dans `.env.local` les deux valeurs publiques du projet si
   elles ne sont pas déjà injectées par l'intégration Vercel/Supabase :

```env
VITE_SUPABASE_URL=https://VOTRE_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=VOTRE_CLE_PUBLIQUE_ANON
```

L'intégration Vercel fournit automatiquement `NEXT_PUBLIC_SUPABASE_URL` et
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, également acceptées par l'application.

Ne jamais placer la cle `service_role` dans une variable `VITE_*` ni dans le
frontend : elle contournerait les protections RLS.

4. Redemarrer l'aperçu local :

```bash
npm run dev
```

Le badge Admin passe alors de `Mode demo local` a `Supabase connecte`.

## Connexion Google et Microsoft

Les boutons de connexion du site appellent Supabase Auth :

- Google utilise le provider `google` ;
- Microsoft utilise le provider `azure`.

Pour les rendre actifs, ouvrir Supabase > Authentication > Providers, puis
activer Google et Azure avec les identifiants OAuth crees dans Google Cloud et
Microsoft Azure. Dans chaque application OAuth, ajouter l'URL de callback
Supabase :

```text
https://VOTRE_PROJECT_REF.supabase.co/auth/v1/callback
```

Dans Supabase > Authentication > URL Configuration, definir l'URL du site et les
redirections autorisees :

```text
http://127.0.0.1:3000
https://votre-domaine-production.fr
```

Important : sur cette version, Google/Microsoft sert a connecter des comptes
deja valides. La premiere demande d'acces reste volontairement filtree par
SIREN, email professionnel et validation manuelle.

## Premier administrateur

Inscrire d'abord votre compte via l'interface du site. Dans le SQL Editor
Supabase, promouvoir uniquement votre email :

```sql
update public.profiles
set role = 'admin',
    access_status = 'approved',
    approved_at = now()
where professional_email = 'votre-email-professionnel@domaine.fr';
```

Ce compte peut ensuite approuver ou refuser les autres demandes depuis le site.

## Securite

- Les inscriptions creent automatiquement une demande `pending`.
- Un utilisateur non valide ne peut pas utiliser l'espace metier.
- Un agent ne lit que son profil, ses recherches, ses favoris et ses logs.
- Une agence peut suivre les membres et usages de sa propre organisation.
- Un admin approuve les acces et consulte les compteurs globaux.
- Les recherches sont enregistrees par une fonction SQL qui controle le quota.
- Les favoris et validations alimentent automatiquement le journal d'audit.

La verification SIREN est faite dans l'interface via l'API publique Entreprise,
puis la validation humaine reste requise avant activation. Pour un lancement
commercial, la verification SIREN peut aussi etre repetee dans une fonction
serveur afin de ne pas faire confiance aux seules donnees envoyees par le navigateur.
