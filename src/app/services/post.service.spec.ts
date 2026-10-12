/// <reference types="vitest/globals" />
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Post } from '../models/post.model';
import { PostService } from './post.service';

describe('PostService', () => {
  let service: PostService;
  let httpMock: HttpTestingController;

  const mockPosts: Post[] = Array.from({ length: 12 }, (_, index) => ({
    userId: 1,
    id: index + 1,
    title: `Title ${index + 1}`,
    body: `Body ${index + 1}`,
  }));

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PostService],
    });

    service = TestBed.inject(PostService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch posts and apply the limit', () => {
    const limit = 5;
    let result: Post[] | undefined;

    service.getPosts(limit).subscribe((posts) => {
      result = posts;
    });

    const req = httpMock.expectOne('https://jsonplaceholder.typicode.com/posts');
    expect(req.request.method).toBe('GET');
    req.flush(mockPosts);

    expect(result).toBeDefined();
    expect(result!.length).toBe(limit);
    expect(result![0].id).toBe(1);
    expect(result![4].id).toBe(5);
  });

  it('should fetch a single post by id', () => {
    const expectedPost = mockPosts[2];
    let result: Post | undefined;

    service.getPostById(3).subscribe((post) => {
      result = post;
    });

    const req = httpMock.expectOne('https://jsonplaceholder.typicode.com/posts/3');
    expect(req.request.method).toBe('GET');
    req.flush(expectedPost);

    expect(result).toEqual(expectedPost);
  });

  it('should propagate HTTP errors', () => {
    let errorStatus: number | undefined;

    service.getPostById(999).subscribe({
      next: () => expect.unreachable('Expected an error, but got a success response'),
      error: (error) => {
        errorStatus = error.status;
      },
    });

    const req = httpMock.expectOne('https://jsonplaceholder.typicode.com/posts/999');
    req.flush('Not found', { status: 404, statusText: 'Not Found' });

    expect(errorStatus).toBe(404);
  });
});
