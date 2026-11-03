import { describe, expect, it } from "vitest";
import { buildRecipesHref, parseRecipeListQuery } from "./recipe-list-query";

describe("recipe list filters", () => {
  it("preserves combined filters and sorting across pages", () => {
    const query = parseRecipeListQuery({
      page: "2",
      categoryId: "  category-1  ",
      difficulty: "Medium",
      maxCookTime: "30",
      sort: "cookTime",
    });

    expect(query).toEqual({
      page: 2,
      categoryId: "category-1",
      difficulty: "Medium",
      maxCookTime: 30,
      sort: "cookTime",
    });
    expect(buildRecipesHref(query, 3)).toBe(
      "/recipes?page=3&categoryId=category-1&difficulty=Medium&maxCookTime=30&sort=cookTime",
    );
    expect(buildRecipesHref(query, 1)).toBe(
      "/recipes?categoryId=category-1&difficulty=Medium&maxCookTime=30&sort=cookTime",
    );
  });

  it("drops invalid URL values before requesting recipes", () => {
    expect(parseRecipeListQuery({
      page: "-2",
      difficulty: "Impossible",
      maxCookTime: "-10",
      sort: "invalid",
    })).toEqual({
      page: 1,
      categoryId: undefined,
      difficulty: undefined,
      maxCookTime: undefined,
      sort: "-createdAt",
    });
    expect(parseRecipeListQuery({ maxCookTime: "99999999999999999999" }).maxCookTime).toBeUndefined();
    expect(buildRecipesHref(parseRecipeListQuery({}), 1)).toBe("/recipes");
  });
});
