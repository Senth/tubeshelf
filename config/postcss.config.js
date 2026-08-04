import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const postcssConfig = {
  plugins: {
    '@tailwindcss/postcss': {
      config: path.join(__dirname, 'tailwind.config.js'),
    },
  },
};

export default postcssConfig;
