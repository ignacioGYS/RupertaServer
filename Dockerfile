# Usamos Node.js oficial y ligero
FROM node:18-alpine

# Nos paramos en la carpeta de trabajo del contenedor
WORKDIR /app

# Copiamos los archivos de configuración de paquetes
COPY package*.json ./

# Instalamos todas las dependencias
RUN npm install

# Copiamos todo el código fuente (frontend y backend)
COPY . .

# Compilamos el frontend construido en Vite
RUN npm run build

ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

# Arrancamos la aplicación usando el script que tenés definido
CMD ["npm", "start"]
