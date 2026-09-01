# Remington Williams - Portfolio Website

An interactive personal portfolio website featuring a Newton's Cradle animation and project showcase.

🔗 **Live Site**: [remingtonwilliams.com](https://remingtonwilliams.com)

## Overview

This portfolio website showcases my work as a Creative Technologist and Software Engineer, featuring interactive physics-based animations and a clean, modern design. The site highlights projects spanning software development, human-centered design, and creative technology.

## Features

- **Interactive Newton's Cradle**: Physics-based animation using Matter.js
- **Draggable Project Cards**: Smooth GSAP animations for project exploration
- **Responsive Design**: Optimized for desktop and mobile devices
- **SEO Optimized**: Meta tags, sitemap, and Google Search Console integration
- **Social Media Preview**: Custom Open Graph images for link sharing
- **Custom Favicon**: "RW" branding in Museo Moderno font

## Tech Stack

**Frontend:**
- HTML5, CSS3, JavaScript
- GSAP (GreenSock Animation Platform)
- Matter.js (Physics engine)

**Backend:**
- Python Flask
- Jinja2 templating

**Deployment:**
- Netlify (Hosting & DNS)
- Git/GitHub (Version control)

## Project Structure

```
2026remiwebsite/
├── static/
│   ├── css/
│   │   └── style.css          # Main stylesheet
│   ├── Prinsys/               # Project images
│   ├── Encrypted_Chat/
│   ├── Islanding/
│   ├── Algorithmic_Craft/
│   ├── Cradle/                # Newton's Cradle assets
│   ├── favicon.png            # Site favicon
│   ├── popup_preview.png      # Social media preview image
│   ├── robots.txt             # Search engine directives
│   └── sitemap.xml            # Site map for SEO
├── templates/
│   └── index.html             # Main HTML template
├── app.py                     # Flask application
├── build.py                   # Static site generator
└── requirements.txt           # Python dependencies
```

## Local Development

### Prerequisites
- Python 3.x
- pip

### Setup

1. Clone the repository:
```bash
git clone https://github.com/Rwilly1/Cradle.git
cd Cradle
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the Flask development server:
```bash
python app.py
```

4. Open your browser to `http://127.0.0.1:5000`

### Building for Production

Generate static files for deployment:
```bash
python build.py
```

This creates a `dist/` folder with static HTML/CSS/JS files.

## Deployment

The site is automatically deployed to Netlify when changes are pushed to the `main` branch on GitHub.

**Deployment URL**: https://remingtonwilliams.com

## Projects Featured

1. **Prinsys** - Mobile application design
2. **Encrypted Chat** - Secure messaging platform
3. **Algorithmic Crafting** - Generative art and knot diagrams
4. **Islanding NYC** - Interactive iPad application
5. **About** - Personal background and tech stack

## Performance Optimizations

- Image optimization (Prinsys mobile image: 23MB → 176KB)
- Preloading critical assets
- Responsive image loading with `<picture>` elements
- Minified CSS and optimized animations

## SEO & Analytics

- Google Search Console verified
- Sitemap submitted for indexing
- Meta descriptions and Open Graph tags
- Structured data for rich snippets

## License

© 2026 Remington Williams. All rights reserved.

## Contact

For inquiries, reach out via:
- Email: remi@remingtonwilliams.com
- LinkedIn: [/remington-williams](https://linkedin.com/in/remington-williams)
- Instagram: [@remingtonwilliams_](https://instagram.com/remingtonwilliams_)
