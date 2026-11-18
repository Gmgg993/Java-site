import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.awt.Desktop;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.concurrent.Executors;

/**
 * TechParts — интернет-магазин комплектующих для ПК и телефонов.
 * Запускает локальный сайт без сторонних библиотек: страницы из папки web,
 * данные и загруженные файлы в папке data.
 */
public class Main {

    static Path webDir;

    public static void main(String[] args) throws Exception {
        System.setOut(new java.io.PrintStream(System.out, true, "UTF-8"));
        webDir = findWebDir();
        if (webDir == null) {
            System.out.println("Не найдена папка web рядом с программой.");
            System.out.println("Запускайте программу из папки проекта (через run.bat / run.sh).");
            return;
        }
        Db.init(webDir.getParent());

        HttpServer server = null;
        int port = 8080;
        for (; port < 8100; port++) {
            try {
                server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
                break;
            } catch (IOException busy) {
                // порт занят — пробуем следующий
            }
        }
        if (server == null) {
            System.out.println("Не удалось найти свободный порт (8080–8099).");
            return;
        }
        server.setExecutor(Executors.newFixedThreadPool(16));
        server.createContext("/api/", Api::handle);
        server.createContext("/uploads/", Main::uploadFile);
        server.createContext("/", Main::staticFile);
        server.start();

        String url = "http://localhost:" + port + "/";
        System.out.println("==================================================");
        System.out.println(" TechParts запущен: " + url);
        System.out.println(" Администратор: логин admin, пароль " + Seed.ADMIN_PASSWORD);
        System.out.println(" Данные и файлы хранятся в папке: " + Db.dataDir);
        System.out.println(" Чтобы остановить сайт, закройте это окно (Ctrl+C).");
        System.out.println("==================================================");
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
            }
        } catch (Exception e) {
            System.out.println("Откройте адрес в браузере вручную: " + url);
        }
    }

    /** Ищет папку web: сначала в текущей папке, затем выше папки с классами (удобно для запуска из IDE). */
    static Path findWebDir() {
        Path cwd = Paths.get("").toAbsolutePath().normalize();
        if (Files.isDirectory(cwd.resolve("web"))) {
            return cwd.resolve("web");
        }
        try {
            Path p = Paths.get(Main.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toAbsolutePath();
            for (int i = 0; i < 5 && p != null; i++) {
                if (Files.isDirectory(p.resolve("web"))) {
                    return p.resolve("web").normalize();
                }
                p = p.getParent();
            }
        } catch (Exception ignored) {
            // не нашли — вернём null ниже
        }
        return null;
    }

    // ---------------- файлы сайта ----------------

    static void staticFile(HttpExchange ex) throws IOException {
        String rel = ex.getRequestURI().getPath();
        if (rel.equals("/")) {
            rel = "/index.html";
        }
        Path file = webDir.resolve(rel.substring(1)).normalize();
        if (!file.startsWith(webDir) || !Files.isRegularFile(file)) {
            byte[] msg = "404 — страница не найдена".getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
            ex.sendResponseHeaders(404, msg.length);
            try (OutputStream os = ex.getResponseBody()) {
                os.write(msg);
            }
            return;
        }
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        sendFile(ex, file);
    }

    /** Загруженные фото и видео: поддерживается перемотка видео (Range). */
    static void uploadFile(HttpExchange ex) throws IOException {
        String name = ex.getRequestURI().getPath().substring("/uploads/".length());
        Path file = Db.uploads.resolve(name).normalize();
        if (!name.matches("[A-Za-z0-9._-]+") || !file.startsWith(Db.uploads) || !Files.isRegularFile(file)) {
            ex.sendResponseHeaders(404, -1);
            ex.close();
            return;
        }
        ex.getResponseHeaders().set("Cache-Control", "public, max-age=3600");
        ex.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        sendFile(ex, file);
    }

    static String contentType(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".html")) return "text/html; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".mp4")) return "video/mp4";
        if (n.endsWith(".webm")) return "video/webm";
        if (n.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    static void sendFile(HttpExchange ex, Path file) throws IOException {
        long size = Files.size(file);
        long start = 0;
        long end = size - 1;
        int code = 200;
        String range = ex.getRequestHeaders().getFirst("Range");
        if (range != null && range.startsWith("bytes=") && size > 0) {
            try {
                String[] parts = range.substring(6).split("-", 2);
                if (parts[0].isEmpty()) {
                    start = Math.max(0, size - Long.parseLong(parts[1]));
                } else {
                    start = Long.parseLong(parts[0]);
                    if (parts.length > 1 && !parts[1].isEmpty()) {
                        end = Math.min(end, Long.parseLong(parts[1]));
                    }
                }
                if (start > end || start >= size) {
                    ex.getResponseHeaders().set("Content-Range", "bytes */" + size);
                    ex.sendResponseHeaders(416, -1);
                    ex.close();
                    return;
                }
                code = 206;
                ex.getResponseHeaders().set("Content-Range", "bytes " + start + "-" + end + "/" + size);
            } catch (NumberFormatException e) {
                start = 0;
                end = size - 1;
            }
        }
        long len = size == 0 ? 0 : end - start + 1;
        ex.getResponseHeaders().set("Content-Type", contentType(file.getFileName().toString()));
        ex.getResponseHeaders().set("Accept-Ranges", "bytes");
        ex.sendResponseHeaders(code, len == 0 ? -1 : len);
        if (len == 0) {
            ex.close();
            return;
        }
        try (InputStream in = Files.newInputStream(file); OutputStream os = ex.getResponseBody()) {
            long skipped = 0;
            while (skipped < start) {
                long s = in.skip(start - skipped);
                if (s <= 0) {
                    break;
                }
                skipped += s;
            }
            byte[] buf = new byte[65536];
            long left = len;
            while (left > 0) {
                int n = in.read(buf, 0, (int) Math.min(buf.length, left));
                if (n < 0) {
                    break;
                }
                os.write(buf, 0, n);
                left -= n;
            }
        } catch (IOException clientGone) {
            // браузер закрыл соединение (например, при перемотке видео) — это нормально
        }
    }
}
