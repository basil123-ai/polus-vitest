/// <reference types="vitest/globals" />
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { Post } from '../../models/post.model';
import { PostService } from '../../services/post.service';
import { PostListComponent } from './post-list.component';

describe('PostListComponent', () => {
  let component: PostListComponent;
  let fixture: ComponentFixture<PostListComponent>;
  let postService: PostService;

  const mockPosts: Post[] = [
    { userId: 1, id: 1, title: 'First post', body: 'First body' },
    { userId: 1, id: 2, title: 'Second post', body: 'Second body' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PostListComponent],
      imports: [HttpClientTestingModule],
      providers: [PostService],
    }).compileComponents();

    fixture = TestBed.createComponent(PostListComponent);
    component = fixture.componentInstance;
    postService = TestBed.inject(PostService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load posts on init', () => {
    const getPostsSpy = vi.spyOn(postService, 'getPosts').mockReturnValue(of(mockPosts));

    component.loadPosts();

    expect(getPostsSpy).toHaveBeenCalledWith(5);
    expect(component.posts).toEqual(mockPosts);
    expect(component.loading).toBe(false);
    expect(component.error).toBeNull();
  });

  it('should show an error message when the API call fails', () => {
    vi.spyOn(postService, 'getPosts').mockReturnValue(
      throwError(() => new Error('Network error')),
    );

    component.loadPosts();

    expect(component.posts).toEqual([]);
    expect(component.loading).toBe(false);
    expect(component.error).toBe('Failed to load posts');
  });

  it('should render post titles in the template', () => {
    vi.spyOn(postService, 'getPosts').mockReturnValue(of(mockPosts));

    component.posts = mockPosts;
    component.loading = false;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('li strong')?.textContent).toContain('First post');
    expect(compiled.querySelectorAll('li').length).toBe(2);
  });
});
