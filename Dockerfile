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

# Exponemos el puerto (asumo el 3000, si tu server.js usa otro, cámbialo aquí)
EXPOSE 3000

# Arrancamos la aplicación usando el script que tenés definido
CMD ["npm", "start"]
