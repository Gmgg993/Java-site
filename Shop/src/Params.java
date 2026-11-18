import java.util.Map;

/**
 * Проверка введённых данных.
 * Пустое значение или недопустимое число — ApiError с понятным сообщением.
 */
public final class Params {
    private final Map<String, Object> m;

    Params(Map<String, Object> m) {
        this.m = m;
    }

    String str(String key, String label) {
        String v = M.s(m, key);
        if (v.isEmpty()) {
            throw new ApiError(400, "Поле «" + label + "» пустое. Введите значение.");
        }
        return v;
    }

    int integer(String key, String label, int min, int max) {
        String s = str(key, label);
        int v;
        try {
            v = Integer.parseInt(s.replaceAll("\\.0+$", ""));
        } catch (NumberFormatException e) {
            throw new ApiError(400, "«" + label + "»: значение \"" + s + "\" не является целым числом.");
        }
        if (v < min || v > max) {
            throw new ApiError(400, "«" + label + "»: число должно быть от " + min + " до " + max + ".");
        }
        return v;
    }

    double number(String key, String label, double min, double max) {
        String s = str(key, label).replace(',', '.').replace(" ", "");
        double v;
        try {
            v = Double.parseDouble(s);
        } catch (NumberFormatException e) {
            throw new ApiError(400, "«" + label + "»: значение \"" + s + "\" не является числом.");
        }
        if (Double.isNaN(v) || Double.isInfinite(v)) {
            throw new ApiError(400, "«" + label + "»: введите обычное число.");
        }
        if (v < min || v > max) {
            throw new ApiError(400, "«" + label + "»: число должно быть от " + trim(min) + " до " + trim(max) + ".");
        }
        return v;
    }

    boolean yes(String key, String label) {
        Object raw = m.get(key);
        if (raw instanceof Boolean) {
            return (Boolean) raw;
        }
        String v = str(key, label);
        if (v.equals("yes") || v.equals("true")) {
            return true;
        }
        if (v.equals("no") || v.equals("false")) {
            return false;
        }
        throw new ApiError(400, "«" + label + "»: выберите «Да» или «Нет».");
    }

    private static String trim(double d) {
        return d == Math.floor(d) ? String.valueOf((long) d) : String.valueOf(d);
    }
}
