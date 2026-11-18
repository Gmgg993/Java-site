import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Простая база данных: каждая таблица — JSON-файл в папке data/. */
public final class Db {
    static Path root;
    static Path dataDir;
    static Path uploads;

    static Table users;
    static Table products;
    static Table posts;
    static Table ads;
    static Table orders;
    static Table events;

    private Db() {
    }

    static void init(Path rootDir) throws IOException {
        root = rootDir;
        dataDir = root.resolve("data");
        uploads = dataDir.resolve("uploads");
        Files.createDirectories(uploads);
        boolean fresh = !Files.exists(dataDir.resolve("products.json"));
        users = new Table("users");
        products = new Table("products");
        posts = new Table("posts");
        ads = new Table("ads");
        orders = new Table("orders");
        events = new Table("events");
        if (fresh) {
            Seed.run();
        }
        Seed.ensureAdmin();
    }

    /** Запись в журнал решений системы (виден администратору). */
    static void event(String text) {
        events.insert(M.map("time", System.currentTimeMillis(), "text", text));
        while (events.rows.size() > 300) {
            events.rows.remove(0);
        }
        events.save();
    }

    static final class Table {
        final Path file;
        final List<Map<String, Object>> rows = new ArrayList<>();
        long next = 1;

        Table(String name) throws IOException {
            file = dataDir.resolve(name + ".json");
            if (Files.exists(file)) {
                Object o = Json.parse(new String(Files.readAllBytes(file), StandardCharsets.UTF_8));
                for (Object x : M.asList(o)) {
                    Map<String, Object> m = M.asMap(x);
                    rows.add(m);
                    next = Math.max(next, M.l(m, "id") + 1);
                }
            }
        }

        List<Map<String, Object>> all() {
            return new ArrayList<>(rows);
        }

        Map<String, Object> find(long id) {
            for (Map<String, Object> m : rows) {
                if (M.l(m, "id") == id) {
                    return m;
                }
            }
            return null;
        }

        Map<String, Object> insert(Map<String, Object> m) {
            m.put("id", next++);
            rows.add(m);
            save();
            return m;
        }

        boolean delete(long id) {
            boolean removed = rows.removeIf(m -> M.l(m, "id") == id);
            if (removed) {
                save();
            }
            return removed;
        }

        void save() {
            try {
                Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
                Files.write(tmp, Json.write(rows).getBytes(StandardCharsets.UTF_8));
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }
}
