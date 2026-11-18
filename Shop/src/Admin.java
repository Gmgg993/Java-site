import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Админ-панель: статьи, товары, реклама, заказы, пользователи и медиатека. */
public final class Admin {
    private Admin() {
    }

    static final List<String> POST_CATEGORIES = Arrays.asList("Новости", "Обзоры", "Гайды", "Акции");
    static final List<String> AD_PLACES = Arrays.asList("top", "side", "feed", "popup", "bottom", "video");
    static final List<String> AD_COLORS = Arrays.asList("green", "gold", "blue", "red", "dark");
    static final List<String> IMAGE_EXT = Arrays.asList("jpg", "jpeg", "png", "gif", "webp");
    static final List<String> VIDEO_EXT = Arrays.asList("mp4", "webm");

    static void requireAdmin(Api.Req r) {
        if (r.user == null) {
            throw new ApiError(401, "Войдите в аккаунт администратора.");
        }
        if (!M.s(r.user, "role").equals("admin")) {
            throw new ApiError(403, "Доступ только для администратора.");
        }
    }

    // ================= маршруты =================

    static Object route(Api.Req r) {
        requireAdmin(r);
        if (r.is("GET", "/api/admin/stats")) return stats();

        if (r.is("GET", "/api/admin/posts")) return allPosts();
        if (r.is("POST", "/api/admin/posts")) return savePost(null, r.body);
        if (r.is("PUT", "/api/admin/posts/(\\d+)")) return savePost(find(Db.posts, r.id(), "Статья"), r.body);
        if (r.is("DELETE", "/api/admin/posts/(\\d+)")) return delete(Db.posts, r.id(), "Статья");

        if (r.is("GET", "/api/admin/products")) return allProducts();
        if (r.is("POST", "/api/admin/products")) return saveProduct(null, r.body);
        if (r.is("PUT", "/api/admin/products/(\\d+)")) return saveProduct(find(Db.products, r.id(), "Товар"), r.body);
        if (r.is("DELETE", "/api/admin/products/(\\d+)")) return delete(Db.products, r.id(), "Товар");

        if (r.is("GET", "/api/admin/ads")) return allAds();
        if (r.is("POST", "/api/admin/ads")) return saveAd(null, r.body);
        if (r.is("PUT", "/api/admin/ads/(\\d+)")) return saveAd(find(Db.ads, r.id(), "Реклама"), r.body);
        if (r.is("DELETE", "/api/admin/ads/(\\d+)")) return delete(Db.ads, r.id(), "Реклама");

        if (r.is("GET", "/api/admin/orders")) return allOrders();
        if (r.is("POST", "/api/admin/orders/(\\d+)/status")) return orderStatus(r);

        if (r.is("GET", "/api/admin/users")) return allUsers();
        if (r.is("POST", "/api/admin/users/(\\d+)")) return userAction(r);

        if (r.is("GET", "/api/admin/media")) return media();
        if (r.is("DELETE", "/api/admin/media/([A-Za-z0-9._-]+)")) return deleteMedia(r.m.group(1));
        throw new ApiError(404, "Раздел не найден.");
    }

    static Map<String, Object> find(Db.Table t, long id, String what) {
        Map<String, Object> m = t.find(id);
        if (m == null) {
            throw new ApiError(404, what + " не найден(а): возможно, уже удалён(а).");
        }
        return m;
    }

    static Object delete(Db.Table t, long id, String what) {
        find(t, id, what);
        t.delete(id);
        return M.map("ok", true);
    }

    // ================= проверка полей =================

    static String text(Map<String, Object> b, String key, String label, int min, int max) {
        String v = M.s(b, key);
        if (v.length() < min) {
            throw new ApiError(400, min <= 1 ? "Поле «" + label + "» обязательно." : "Поле «" + label + "» слишком короткое: минимум " + min + " символов.");
        }
        if (v.length() > max) {
            throw new ApiError(400, "Поле «" + label + "» слишком длинное: максимум " + max + " символов.");
        }
        return v;
    }

    static String cleanMediaUrl(String v, String label) {
        if (v.isEmpty()) {
            return "";
        }
        if (v.matches("/uploads/[A-Za-z0-9._-]+") || v.matches("https?://[^\\s\"'<>]+")) {
            return v;
        }
        throw new ApiError(400, "«" + label + "»: укажите загруженный файл или ссылку, которая начинается с https://");
    }

    static String cleanLink(String v) {
        if (v.isEmpty()) {
            return "#/";
        }
        if (v.matches("#/[A-Za-z0-9/_?=&.-]*") || v.matches("https?://[^\\s\"'<>]+")) {
            return v;
        }
        throw new ApiError(400, "Ссылка рекламы: адрес страницы сайта (например, #/catalog) или ссылка, начинающаяся с https://");
    }

    static String youtubeId(String url) {
        Matcher m = Pattern.compile("(?:v=|youtu\\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})").matcher(url);
        if (m.find()) {
            return m.group(1);
        }
        if (url.matches("[A-Za-z0-9_-]{11}")) {
            return url;
        }
        throw new ApiError(400, "Не удалось распознать ссылку на YouTube. Вставьте полную ссылку на видео.");
    }

    // ================= статьи =================

    static Object allPosts() {
        List<Object> out = new ArrayList<>();
        List<Map<String, Object>> rows = Db.posts.all();
        rows.sort((a, b) -> Long.compare(M.l(b, "created"), M.l(a, "created")));
        out.addAll(rows);
        return out;
    }

    static Object savePost(Map<String, Object> target, Map<String, Object> b) {
        String title = text(b, "title", "Заголовок", 3, 140);
        String category = M.s(b, "category");
        if (!POST_CATEGORIES.contains(category)) {
            throw new ApiError(400, "Выберите рубрику из списка.");
        }
        String body = text(b, "text", "Текст статьи", 10, 20000);
        String cover = cleanMediaUrl(M.s(b, "cover"), "Обложка");
        String videoType = M.s(b, "videoType");
        String videoUrl = M.s(b, "videoUrl");
        switch (videoType) {
            case "file":
                if (!videoUrl.matches("/uploads/[A-Za-z0-9._-]+\\.(mp4|webm)")) {
                    throw new ApiError(400, "Для видео из файла загрузите MP4 или WEBM.");
                }
                break;
            case "youtube":
                videoUrl = youtubeId(videoUrl);
                break;
            default:
                videoType = "none";
                videoUrl = "";
                break;
        }
        List<Object> gallery = new ArrayList<>();
        for (Object o : M.asList(b.get("gallery"))) {
            String u = cleanMediaUrl(String.valueOf(o).trim(), "Фото в галерее");
            if (!u.isEmpty() && gallery.size() < 20) {
                gallery.add(u);
            }
        }
        boolean published = M.b(b, "published");

        Map<String, Object> p = target;
        if (p == null) {
            p = Db.posts.insert(M.map("views", 0, "created", System.currentTimeMillis(), "author", "Редакция TechParts"));
        }
        p.put("title", title);
        p.put("category", category);
        p.put("text", body);
        p.put("cover", cover);
        p.put("videoType", videoType);
        p.put("videoUrl", videoUrl);
        p.put("gallery", gallery);
        p.put("published", published);
        Db.posts.save();
        Db.event("Статья «" + title + "»: " + (target == null ? "создана" : "обновлена") + (published ? "" : " (черновик)"));
        return p;
    }

    // ================= товары =================

    static Object allProducts() {
        List<Object> out = new ArrayList<>();
        for (Map<String, Object> p : Db.products.all()) {
            Map<String, Object> v = Api.productView(p);
            out.add(v);
        }
        return out;
    }

    static Object saveProduct(Map<String, Object> target, Map<String, Object> b) {
        Params p = new Params(b);
        String name = text(b, "name", "Название", 2, 140);
        String cat = M.s(b, "cat");
        if (!Logic.validCategory(cat)) {
            throw new ApiError(400, "Выберите категорию из списка.");
        }
        String brand = text(b, "brand", "Бренд", 0, 40);
        double price = p.number("price", "Цена", 1, 1000000000);
        double oldPrice = M.s(b, "oldPrice").isEmpty() ? 0 : p.number("oldPrice", "Старая цена", 0, 1000000000);
        int stock = p.integer("stock", "Остаток на складе", 0, 100000);
        double weight = M.s(b, "weight").isEmpty() ? 0 : p.number("weight", "Вес, кг", 0, 100);
        String image = cleanMediaUrl(M.s(b, "image"), "Фото товара");
        String desc = text(b, "desc", "Описание", 0, 2000);
        List<Object> specs = new ArrayList<>();
        Object rawSpecs = b.get("specs");
        List<Object> specLines = rawSpecs instanceof List ? M.asList(rawSpecs) : Arrays.asList((Object[]) String.valueOf(rawSpecs == null ? "" : rawSpecs).split("\\r?\\n"));
        for (Object s : specLines) {
            String line = String.valueOf(s).trim();
            if (!line.isEmpty() && specs.size() < 20) {
                specs.add(line.length() > 120 ? line.substring(0, 120) : line);
            }
        }
        Map<String, Object> pr = target;
        if (pr == null) {
            pr = Db.products.insert(M.map("created", System.currentTimeMillis()));
        }
        pr.put("name", name);
        pr.put("cat", cat);
        pr.put("brand", brand);
        pr.put("price", price);
        pr.put("oldPrice", oldPrice);
        pr.put("stock", stock);
        pr.put("weight", weight);
        pr.put("image", image);
        pr.put("desc", desc);
        pr.put("specs", specs);
        pr.put("featured", M.b(b, "featured"));
        Db.products.save();
        Db.event("Товар «" + name + "»: " + (target == null ? "добавлен" : "обновлён"));
        return Api.productView(pr);
    }

    // ================= реклама =================

    static Object allAds() {
        List<Object> out = new ArrayList<>();
        for (Map<String, Object> a : Db.ads.all()) {
            Map<String, Object> v = Api.adView(a);
            v.put("active", M.b(a, "active"));
            v.put("until", M.s(a, "until"));
            v.put("views", M.l(a, "views"));
            v.put("clicks", M.l(a, "clicks"));
            v.put("live", Api.adIsLive(a));
            out.add(v);
        }
        return out;
    }

    static Object saveAd(Map<String, Object> target, Map<String, Object> b) {
        String place = M.s(b, "placement");
        if (!AD_PLACES.contains(place)) {
            throw new ApiError(400, "Выберите место показа рекламы из списка.");
        }
        String title = text(b, "title", "Заголовок", 2, 100);
        String body = text(b, "text", "Текст", 0, 220);
        String button = text(b, "button", "Текст кнопки", 0, 30);
        String link = cleanLink(M.s(b, "link"));
        String image = cleanMediaUrl(M.s(b, "image"), "Картинка");
        String color = M.s(b, "color");
        if (!AD_COLORS.contains(color)) {
            color = "green";
        }
        String until = M.s(b, "until");
        if (!until.isEmpty()) {
            try {
                LocalDate.parse(until);
            } catch (java.time.format.DateTimeParseException e) {
                throw new ApiError(400, "Дата окончания показа указана неверно.");
            }
        }
        Map<String, Object> a = target;
        if (a == null) {
            a = Db.ads.insert(M.map("views", 0, "clicks", 0));
        }
        a.put("placement", place);
        a.put("title", title);
        a.put("text", body);
        a.put("button", button);
        a.put("link", link);
        a.put("image", image);
        a.put("color", color);
        a.put("active", M.b(b, "active"));
        a.put("until", until);
        Db.ads.save();
        Db.event("Реклама «" + title + "»: " + (target == null ? "создана" : "обновлена"));
        return Api.adView(a);
    }

    // ================= заказы и пользователи =================

    static Object allOrders() {
        List<Object> out = new ArrayList<>();
        List<Map<String, Object>> rows = Db.orders.all();
        Collections.reverse(rows);
        for (Map<String, Object> o : rows) {
            out.add(Api.orderView(o));
        }
        return out;
    }

    static Object orderStatus(Api.Req r) {
        Map<String, Object> o = find(Db.orders, r.id(), "Заказ");
        String status = M.s(r.body, "status");
        if (!Arrays.asList(Api.ORDER_STATUSES).contains(status)) {
            throw new ApiError(400, "Неизвестный статус заказа.");
        }
        String old = M.s(o, "status");
        if (old.equals("cancelled") && !status.equals("cancelled")) {
            throw new ApiError(400, "Отменённый заказ нельзя вернуть в работу: оформите новый.");
        }
        if (status.equals("cancelled") && !old.equals("cancelled")) {
            for (Object it : M.asList(o.get("items"))) {
                Map<String, Object> im = M.asMap(it);
                Map<String, Object> p = Db.products.find(M.l(im, "id"));
                if (p != null) {
                    p.put("stock", M.l(p, "stock") + M.l(im, "qty"));
                }
            }
            Db.products.save();
        }
        o.put("status", status);
        Db.orders.save();
        Db.event("Заказ №" + o.get("id") + ": статус «" + Api.statusRu(status) + "»");
        return Api.orderView(o);
    }

    static Object allUsers() {
        List<Object> out = new ArrayList<>();
        for (Map<String, Object> u : Db.users.all()) {
            List<Map<String, Object>> orders = Api.ordersOf(u);
            double sum = 0;
            for (Map<String, Object> o : orders) {
                String st = M.s(o, "status");
                if (!st.equals("cancelled") && !st.equals("returned")) {
                    sum += M.d(o, "total");
                }
            }
            Map<String, Object> v = Api.userView(u);
            v.put("blocked", M.b(u, "blocked"));
            v.put("partner", M.b(u, "partner"));
            v.put("orders", orders.size());
            v.put("sum", sum);
            v.put("loyalty", Logic.loyaltyText(Logic.loyaltyStatus(u, orders, null)));
            out.add(v);
        }
        return out;
    }

    static Object userAction(Api.Req r) {
        Map<String, Object> u = find(Db.users, r.id(), "Пользователь");
        boolean self = M.l(u, "id") == M.l(r.user, "id");
        Map<String, Object> b = r.body;
        if (b.containsKey("blocked")) {
            if (self) {
                throw new ApiError(400, "Нельзя заблокировать самого себя.");
            }
            u.put("blocked", M.b(b, "blocked"));
            Db.event("Пользователь " + M.s(u, "login") + (M.b(b, "blocked") ? " заблокирован" : " разблокирован"));
        }
        if (b.containsKey("partner")) {
            u.put("partner", M.b(b, "partner"));
            Db.event("Пользователь " + M.s(u, "login") + (M.b(b, "partner") ? ": выдана партнёрская карта" : ": партнёрская карта снята"));
        }
        if (b.containsKey("role")) {
            String role = M.s(b, "role");
            if (!role.equals("user") && !role.equals("admin")) {
                throw new ApiError(400, "Неизвестная роль.");
            }
            if (self && !role.equals("admin")) {
                throw new ApiError(400, "Нельзя снять права администратора с самого себя.");
            }
            u.put("role", role);
            Db.event("Пользователь " + M.s(u, "login") + ": роль «" + (role.equals("admin") ? "администратор" : "пользователь") + "»");
        }
        Db.users.save();
        return M.map("ok", true);
    }

    // ================= обзор =================

    static Object stats() {
        List<Map<String, Object>> orders = Db.orders.all();
        double revenue = 0;
        int review = 0;
        int call = 0;
        int ratingN = 0;
        double ratingSum = 0;
        for (Map<String, Object> o : orders) {
            String st = M.s(o, "status");
            if (!st.equals("cancelled") && !st.equals("returned")) {
                revenue += M.d(o, "total");
            }
            if (st.equals("review")) {
                review++;
            }
            if (st.equals("call")) {
                call++;
            }
            if (M.l(o, "rating") >= 0 && o.get("rating") != null) {
                ratingN++;
                ratingSum += M.l(o, "rating");
            }
        }
        List<Object> lowStock = new ArrayList<>();
        for (Map<String, Object> p : Db.products.all()) {
            if (M.l(p, "stock") <= 5) {
                lowStock.add(M.map("id", p.get("id"), "name", p.get("name"), "stock", M.l(p, "stock")));
            }
        }
        int publishedPosts = 0;
        long views = 0;
        for (Map<String, Object> p : Db.posts.all()) {
            if (M.b(p, "published")) {
                publishedPosts++;
            }
            views += M.l(p, "views");
        }
        long adViews = 0;
        long adClicks = 0;
        int liveAds = 0;
        for (Map<String, Object> a : Db.ads.all()) {
            adViews += M.l(a, "views");
            adClicks += M.l(a, "clicks");
            if (Api.adIsLive(a)) {
                liveAds++;
            }
        }

        List<Object> todo = new ArrayList<>();
        if (review > 0) {
            todo.add("Заказов на проверке: " + review + ". Свяжитесь с покупателями и подтвердите заказы.");
        }
        if (call > 0) {
            todo.add("Ждут звонка менеджера: " + call + ".");
        }
        if (!lowStock.isEmpty()) {
            todo.add("Товары заканчиваются или закончились: " + lowStock.size() + ". Пополните склад.");
        }
        if (liveAds == 0) {
            todo.add("Нет ни одной активной рекламы. Включите баннер в разделе «Реклама».");
        }
        String level;
        String headline;
        if (review > 0) {
            level = "bad";
            headline = "Есть срочные дела";
        } else if (!todo.isEmpty()) {
            level = "warn";
            headline = "Есть над чем поработать";
        } else {
            level = "good";
            headline = "Срочных дел нет";
            todo.add("Всё в порядке: заказы обработаны, товаров хватает.");
        }

        List<Object> events = new ArrayList<>();
        List<Map<String, Object>> ev = Db.events.all();
        for (int i = ev.size() - 1; i >= 0 && events.size() < 15; i--) {
            events.add(ev.get(i));
        }
        Map<String, Object> grade = ratingN > 0 ? Logic.grade((int) Math.round(ratingSum / ratingN)) : null;

        return M.map("users", Db.users.rows.size(), "orders", orders.size(), "revenue", revenue,
                "review", review, "call", call, "lowStock", lowStock,
                "posts", M.map("total", Db.posts.rows.size(), "published", publishedPosts, "views", views),
                "products", Db.products.rows.size(),
                "ads", M.map("live", liveAds, "views", adViews, "clicks", adClicks,
                        "ctr", adViews > 0 ? Math.round(adClicks * 1000.0 / adViews) / 10.0 : 0),
                "rating", ratingN > 0 ? M.map("avg", Math.round(ratingSum / ratingN), "count", ratingN, "mark", grade.get("mark")) : null,
                "verdict", M.map("level", level, "headline", headline, "todo", todo),
                "events", events);
    }

    // ================= файлы: фото и видео =================

    static Object upload(Api.Req r) throws IOException {
        synchronized (Api.LOCK) {
            r.user = Api.currentUser(r);
            requireAdmin(r);
        }
        String name = r.q.getOrDefault("name", "file").toLowerCase(Locale.ROOT);
        int dot = name.lastIndexOf('.');
        String ext = dot < 0 ? "" : name.substring(dot + 1).replaceAll("[^a-z0-9]", "");
        boolean image = IMAGE_EXT.contains(ext);
        boolean video = VIDEO_EXT.contains(ext);
        if (!image && !video) {
            throw new ApiError(400, "Этот формат не поддерживается. Разрешены фото JPG, PNG, GIF, WEBP и видео MP4, WEBM.");
        }
        long max = image ? 15L * 1024 * 1024 : 500L * 1024 * 1024;
        String cl = r.ex.getRequestHeaders().getFirst("Content-Length");
        if (cl != null) {
            try {
                if (Long.parseLong(cl) > max) {
                    throw new ApiError(413, "Файл слишком большой: фото до 15 МБ, видео до 500 МБ.");
                }
            } catch (NumberFormatException ignored) {
                // длину проверим по факту чтения
            }
        }
        String file = LocalDate.now().toString().replace("-", "") + "-" + Auth.randomToken(5) + "." + ext;
        Path target = Db.uploads.resolve(file);
        long total = 0;
        try (InputStream in = r.ex.getRequestBody(); OutputStream out = Files.newOutputStream(target)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > max) {
                    break;
                }
                out.write(buf, 0, n);
            }
        }
        if (total > max) {
            Files.deleteIfExists(target);
            throw new ApiError(413, "Файл слишком большой: фото до 15 МБ, видео до 500 МБ.");
        }
        if (total == 0) {
            Files.deleteIfExists(target);
            throw new ApiError(400, "Файл пустой. Выберите другой файл.");
        }
        synchronized (Api.LOCK) {
            Db.event("Загружен файл: " + file);
        }
        return M.map("url", "/uploads/" + file, "name", file, "size", total, "type", image ? "image" : "video");
    }

    static Object media() {
        List<Object> out = new ArrayList<>();
        List<Path> files = new ArrayList<>();
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(Db.uploads)) {
            for (Path p : ds) {
                files.add(p);
            }
        } catch (IOException e) {
            throw new ApiError(500, "Не удалось прочитать папку с файлами.");
        }
        files.sort((a, b) -> b.getFileName().toString().compareTo(a.getFileName().toString()));
        for (Path p : files) {
            String n = p.getFileName().toString();
            String ext = n.substring(n.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
            try {
                out.add(M.map("name", n, "url", "/uploads/" + n, "size", Files.size(p),
                        "type", VIDEO_EXT.contains(ext) ? "video" : "image"));
            } catch (IOException ignored) {
                // файл исчез — пропускаем
            }
        }
        return out;
    }

    static Object deleteMedia(String name) {
        Path p = Db.uploads.resolve(name).normalize();
        if (!p.startsWith(Db.uploads) || !Files.isRegularFile(p)) {
            throw new ApiError(404, "Файл не найден.");
        }
        try {
            Files.delete(p);
        } catch (IOException e) {
            throw new ApiError(500, "Не удалось удалить файл.");
        }
        return M.map("ok", true);
    }
}
