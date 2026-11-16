FROM nginx:alpine

# Copy static frontend assets into standard nginx document root
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
