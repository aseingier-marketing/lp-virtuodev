# Soarly — Landing Page Astro

Landing page prévente fondateur, migrée en Astro 5 (SSG) depuis un fichier HTML single-file.

## Commandes

```bash
npm install        # Installer les dépendances
npm run dev        # Lancer le serveur de développement (http://localhost:4321)
npm run build      # Build de production → ./dist/
npm run preview    # Prévisualiser le build local
```

## Variables à personnaliser

Toutes les variables de contenu sont directement dans les composants Astro. Recherchez les chaînes suivantes et remplacez-les :

| Chaîne à remplacer | Localisation | Description |
|---|---|---|
| `[NOM MARQUE]` | `Nav.astro`, `Footer.astro`, `index.astro` (title/og) | Nom de votre marque / produit |
| `[Prénom]` | `FounderCredibility.astro` | Prénom du fondateur |
| `[PHOTO]` | `FounderCredibility.astro` | Remplacer le div placeholder par `<img src="..." alt="...">` |
| `[VIDEO FONDATEUR 60-90s]` | `Hero.astro` | Remplacer le div placeholder par votre vidéo |
| `contact@exemple.com` | `Objections.astro` | Email de contact |
| `https://votre-domaine.fr` | `src/pages/index.astro` (prop `ogUrl`) | URL publique du site |
| `/og-image.jpg` | `src/pages/index.astro` (prop `ogImage`) | Image Open Graph (1200×630px) |
| `100` (places restantes) | `FinalCTA.astro` → `PLACES_LEFT` dans `index.astro` | Nombre de places restantes |

### Nombre de places restantes

Dans `src/pages/index.astro`, modifier la valeur `PLACES_LEFT` dans le bloc `<script>` :

```js
const PLACES_LEFT = 100; // ← changer cette valeur
```

### Contenu des témoignages

Dans `src/pages/index.astro`, les deux composants `<Testimonial />` :

```astro
<Testimonial
  name="Prénom"
  role="Rôle · Entreprise"
  text="« Citation du témoignage. »"
  gsKey="t1"
/>
```

### Lien Calendly

Si vous souhaitez rediriger vers Calendly au lieu du formulaire, remplacez les `onclick` qui font `scrollIntoView` vers `#section-callback` par :

```js
onclick="window.open('https://calendly.com/votre-lien', '_blank', 'noopener,noreferrer')"
```

## Structure des fichiers

```
src/
  components/
    Nav.astro               ← Barre de navigation fixe
    Hero.astro              ← Section hero (fond sombre)
    Testimonial.astro       ← Composant témoignage flottant réutilisable
    FounderCredibility.astro ← Histoire du fondateur (timeline)
    SocialProof.astro       ← Pour qui / Avant-Après
    Problem.astro           ← Le problème des devis non relancés
    QuizCalculator.astro    ← Simulateur CA perdu (4 étapes + résultats)
    Solution.astro          ← Comment ça marche + Notre différence
    FounderOffer.astro      ← Offre entreprises fondatrices
    Form.astro              ← Formulaire de demande de place
    Confirmation.astro      ← État de succès du formulaire
    Objections.astro        ← FAQ accordéon
    FinalCTA.astro          ← Dernier call-to-action
    Footer.astro            ← Pied de page
    StickyCTAMobile.astro   ← Bouton CTA fixe mobile
    Chatbot.astro           ← Stub chatbot (à intégrer)
    ExitIntent.astro        ← Stub exit-intent (à intégrer)
  layouts/
    Base.astro              ← <head>, meta SEO, fonts, GSAP
  pages/
    index.astro             ← Page principale (assemble les composants)
  styles/
    tokens.css              ← CSS custom properties (design tokens)
    global.css              ← Reset, base styles, tous les composants CSS
```

## SEO

`Base.astro` inclut :
- `<title>` et `<meta name="description">` paramétrables via props
- Open Graph complet (og:title, og:description, og:image, og:url, og:type)
- Twitter Card `summary_large_image`
- `<link rel="canonical">`
- `lang="fr"` sur `<html>`
- Schema.org JSON-LD `WebPage` + `Organization`
- `<meta name="robots" content="index, follow">`

## Performance

- GSAP chargé en `defer` (non bloquant)
- Google Fonts avec `preconnect` + `preload`
- Zéro JS côté client par défaut sauf les scripts inline des composants
- Build statique Astro 5 (SSG)
