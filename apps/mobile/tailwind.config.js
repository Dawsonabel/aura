/** @type {import('tailwindcss').Config} */
// Design tokens from design_handoff_aura_lights_out/README.md ("Lights Out / Monokai", direction
// 3A). Colors are namespaced (`ink-*` for text, `cream-*` for the light surface family) instead
// of matching the README's token names literally (e.g. `text-primary`) — Tailwind's own `text-`
// utility prefix would otherwise collide with a color key already starting with `text-`.
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ground: '#221F22',
        surface: '#403E41',
        raised: '#4A474B',
        cream: {
          DEFAULT: '#FFF6E8',
          inner: '#F2E7D4',
          rule: '#E4D6BF',
          shadow: '#D9C7AF'
        },
        ink: {
          primary: '#FFFFFF',
          bright: '#FCFCFA',
          secondary: '#C1C0C0',
          muted: '#9A989B',
          dim: '#848286',
          faint: '#727074',
          chevron: '#B0AEB2',
          'on-cream': '#2D2A2E',
          'on-cream-muted': '#8B888D',
          'scratch-hidden': '#5B585C'
        },
        pink: { DEFAULT: '#FF5CA8', shadow: '#C43A7C', raised: '#FFC9E4' },
        mint: { DEFAULT: '#6BF2C2', shadow: '#3FBF95', ink: '#0A3B2C', 'ink-soft': '#12664C' },
        yellow: { DEFAULT: '#FFD84D', shadow: '#D4AC17', ink: '#3A2A00', 'ink-soft': '#7A5A00' },
        purple: { DEFAULT: '#7C5CFF', shadow: '#5334D6' },
        orange: { DEFAULT: '#FF7A3D', shadow: '#C4501E', soft: '#FFE0CE' },
        green: { revealed: '#2E8F6E' },
        /* 15A's currency. Same yellow as the `yellow` family on purpose — nothing else in the app owns
           yellow outright, so a coin is recognisable before it's read. Named separately so a future
           change to the currency doesn't drag every superlative chip with it. */
        coin: { DEFAULT: '#FFD84D', shadow: '#D4AC17', ink: '#3A2A00' }
      },
      fontFamily: {
        'fredoka-500': 'Fredoka_500Medium',
        'fredoka-600': 'Fredoka_600SemiBold',
        'fredoka-700': 'Fredoka_700Bold',
        'nunito-600': 'Nunito_600SemiBold',
        'nunito-700': 'Nunito_700Bold',
        'nunito-800': 'Nunito_800ExtraBold',
        'nunito-900': 'Nunito_900Black'
      },
      borderRadius: {
        16: '16px',
        18: '18px',
        20: '20px',
        22: '22px',
        24: '24px',
        26: '26px',
        30: '30px',
        pill: '9999px'
      }
    }
  },
  plugins: []
};
