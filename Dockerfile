# 1. Usar una imagen base oficial de Node.js
FROM node:20-alpine

# 2. Establecer el directorio de trabajo dentro del contenedor
WORKDIR /app

# 3. Copiar los archivos de dependencias
COPY package*.json ./

# 4. Instalar las dependencias
RUN npm install

# 5. Copiar el resto del código de la aplicación
COPY . .

# 6. Exponer el puerto en el que corre tu servidor Express
EXPOSE 3000

# 7. El comando para iniciar la aplicación
CMD [ "node", "index.js" ]